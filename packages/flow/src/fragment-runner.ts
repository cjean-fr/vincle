import { renderToString, type JSX } from "@vincle/core";
// The protocol test is core's — same predicate the tree walk dispatches on, so
// "what counts as a stream" cannot mean one thing here and another there. The
// local copy it replaces needed an `as any` to ask the question at all.
import { isAsyncIterable } from "@vincle/core/html";

import type { TemplateEntry } from "./template-store.js";
import type { FlowEvent, FlowOptions, MergeType, TemplateContent } from "./types.js";

import { createTimeoutSignal } from "./timeout.js";

const isLazyFactory = (
  c: TemplateContent,
): c is
  | ((signal: AbortSignal) => JSX.Element)
  | ((signal: AbortSignal) => AsyncIterable<JSX.Element>) => typeof c === "function";

type ClassificationResult =
  | { kind: "value"; value: JSX.Element | string }
  | { kind: "stream"; iterable: AsyncIterable<JSX.Element> }
  | { kind: "sync-error"; error: unknown };

function classifyEntry(entry: TemplateEntry, signal: AbortSignal): ClassificationResult {
  try {
    const value = isLazyFactory(entry.content) ? entry.content(signal) : entry.content;
    if (isAsyncIterable(value)) return { kind: "stream", iterable: value };
    return { kind: "value", value };
  } catch (error) {
    return { kind: "sync-error", error };
  }
}

type Emit = (ev: FlowEvent) => Promise<void>;

async function emitError(
  emit: Emit,
  onError: FlowOptions["onError"],
  id: string,
  kind: "fragment" | "stream",
  error: unknown,
): Promise<void> {
  console.error(`[vincle/flow] Error rendering ${kind} "${id}"`, error);
  const ui = onError?.(error, { id, kind });
  if (ui != null) {
    await emit({
      type: "fragment",
      id,
      html: await renderToString(ui),
      merge: "replace",
    });
  }
}

/**
 * Route a failure to the error handler. When the handler's own emit fails too
 * the channel is broken, so the original error is the one that propagates.
 */
async function reportOrThrow(
  emit: Emit,
  onError: FlowOptions["onError"],
  id: string,
  kind: "fragment" | "stream",
  error: unknown,
): Promise<void> {
  try {
    await emitError(emit, onError, id, kind, error);
  } catch {
    throw error;
  }
}

type FragmentResult = { isStreaming: boolean; done: Promise<void> };

/**
 * Resolve a single template entry: classify the content and return the work.
 *
 * The returned `{ isStreaming, done }` pair lets the drain loop route one-shots
 * (barrier) vs streams (run concurrently). Classification is synchronous so
 * the caller never has to await a plain value to classify it.
 */
export function runFragment(
  id: string,
  entry: TemplateEntry,
  emit: Emit,
  opts: FlowOptions,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;
  const { signal, cleanup } = createTimeoutSignal(
    entry.timeout ?? opts.defaultTimeout,
    opts.signal,
    id,
  );

  const classification = classifyEntry(entry, signal);

  switch (classification.kind) {
    case "sync-error": {
      cleanup();
      return {
        isStreaming: false,
        done: emitError(emit, handle, id, "fragment", classification.error),
      };
    }
    case "stream": {
      return {
        isStreaming: true,
        done: runStream(id, classification.iterable, entry.merge, emit, handle, signal).finally(
          cleanup,
        ),
      };
    }
    case "value": {
      return {
        isStreaming: false,
        done: runValue(id, classification.value, entry.merge, emit, handle, signal, cleanup),
      };
    }
  }
}

/**
 * One-shot: render once, emit one patch. `cleanup` fires at the render
 * boundary — the deadline covers the render, not the emit that follows it.
 */
async function runValue(
  id: string,
  value: JSX.Element | string,
  merge: MergeType,
  emit: Emit,
  onError: FlowOptions["onError"],
  signal: AbortSignal,
  cleanup: () => void,
): Promise<void> {
  let html: string;
  try {
    html = await renderToString(value);
  } catch (renderError) {
    await reportOrThrow(emit, onError, id, "fragment", renderError);
    return;
  } finally {
    cleanup();
  }

  // The render finished, but past the deadline — treat it like a render error
  // rather than emit content the client may already have given up on waiting for.
  if (signal.aborted) {
    await reportOrThrow(emit, onError, id, "fragment", signal.reason);
    return;
  }

  // A failed emit is fatal: a broken channel cannot carry the fallback either.
  try {
    await emit({ type: "fragment", id, html, merge });
  } catch (error) {
    console.error(`[vincle/flow] Failed to emit fragment "${id}"`, error);
    throw error;
  }
}

async function runStream(
  id: string,
  iterable: AsyncIterable<JSX.Element>,
  merge: MergeType,
  emit: Emit,
  onError: FlowOptions["onError"],
  signal: AbortSignal,
): Promise<void> {
  const it = iterable[Symbol.asyncIterator]();
  const aborted = new Promise<IteratorResult<JSX.Element>>((resolve) => {
    const onAbort = () => resolve({ done: true, value: undefined });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  // `fatal`: true for a failed emit, false for an iteration/render problem —
  // only the former propagates, the latter routes to emitError.
  let fatal = false;

  try {
    while (true) {
      const step = Promise.resolve(it.next());
      step.catch(() => {});
      const r = await Promise.race([step, aborted]);
      if (r.done) break;

      let raw: string;
      try {
        raw = await renderToString(r.value);
      } catch (renderError) {
        await reportOrThrow(emit, onError, id, "stream", renderError);
        continue;
      }

      try {
        await emit({ type: "fragment", id, html: raw, merge });
      } catch (emitErr) {
        console.error(`[vincle/flow] Failed to emit stream chunk for "${id}"`, emitErr);
        fatal = true;
        throw emitErr;
      }
    }
  } catch (error) {
    if (fatal) throw error;
    await reportOrThrow(emit, onError, id, "stream", error);
  } finally {
    if (signal.aborted) await it.return?.(undefined).catch(() => {});
  }
}
