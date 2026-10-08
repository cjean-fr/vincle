import type { Awaitable, JSX } from "@vincle/core";

// The protocol test is core's: same predicate the tree walk dispatches on, so
// "what counts as a stream" cannot mean one thing here and another there. The
// local copy it replaces needed an `as any` to ask the question at all.
import { isAsyncIterable } from "@vincle/core/html";

import type { FragmentEntry } from "./fragment-store.js";
import type { DeferContent, FlowEvent, FlowOptions, MergeType } from "./types.js";

import { abortable } from "./abortable.js";
import { renderFlow } from "./context.js";
import { createTimeoutSignal } from "./timeout.js";

const isLazyFactory = (
  c: DeferContent,
): c is Extract<DeferContent, (signal: AbortSignal) => unknown> => typeof c === "function";

type ClassificationResult =
  | { kind: "value"; value: Awaitable<JSX.Element> | string }
  | { kind: "stream"; iterable: AsyncIterable<JSX.Element | string> }
  | { kind: "sync-error"; error: unknown };

function classifyEntry(entry: FragmentEntry, signal: AbortSignal): ClassificationResult {
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
  opts: FlowOptions,
): Promise<void> {
  console.error(`[vincle/flow] Error rendering ${kind} "${id}"`, error);
  if (opts.signal?.aborted) return;
  const ui = onError?.(error, { id, kind });
  if (ui != null) {
    // A fallback gets its own render deadline: the content's signal may
    // already have timed out, but request cancellation still applies.
    const { signal, cleanup } = createTimeoutSignal(opts.defaultTimeout, opts.signal, id);
    let html: string;
    try {
      html = await abortable(renderFlow(ui), signal);
    } finally {
      cleanup();
    }
    if (signal.aborted) throw signal.reason;
    await emit({ type: "fragment", id, html, merge: "replace" });
  }
}

/**
 * Route a failure to the error handler. If its fallback render or emit fails,
 * propagate the original error without recursively invoking the handler.
 */
async function reportOrThrow(
  emit: Emit,
  onError: FlowOptions["onError"],
  id: string,
  kind: "fragment" | "stream",
  error: unknown,
  opts: FlowOptions,
): Promise<void> {
  try {
    await emitError(emit, onError, id, kind, error, opts);
  } catch {
    throw error;
  }
}

type ReportError = (kind: "fragment" | "stream", error: unknown) => Promise<void>;

type FragmentResult = { isStreaming: boolean; done: Promise<void> };

/**
 * Resolve a single fragment entry: classify the content and return the work.
 *
 * The returned `{ isStreaming, done }` pair lets the drain loop route one-shots
 * (barrier) vs streams (run concurrently). Classification is synchronous so
 * the caller never has to await a plain value to classify it.
 */
export function runFragment(
  id: string,
  entry: FragmentEntry,
  emit: Emit,
  opts: FlowOptions,
): FragmentResult {
  return entry.treeScope
    ? entry.treeScope(() => runFragmentInScope(id, entry, emit, opts))
    : runFragmentInScope(id, entry, emit, opts);
}

function runFragmentInScope(
  id: string,
  entry: FragmentEntry,
  emit: Emit,
  opts: FlowOptions,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;
  const errorOptions = { ...opts, defaultTimeout: entry.timeout ?? opts.defaultTimeout };
  const report: ReportError = (kind, error) =>
    reportOrThrow(emit, handle, id, kind, error, errorOptions);
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
        done: report("fragment", classification.error),
      };
    }
    case "stream": {
      return {
        isStreaming: true,
        done: runStream(id, classification.iterable, entry.merge, emit, report, signal).finally(
          cleanup,
        ),
      };
    }
    case "value": {
      return {
        isStreaming: false,
        done: runValue(id, classification.value, entry.merge, emit, report, signal, cleanup),
      };
    }
  }
}

/**
 * One-shot: render once, emit one patch. `cleanup` fires at the render
 * boundary: the deadline covers the render, not the emit that follows it.
 */
async function runValue(
  id: string,
  value: Awaitable<JSX.Element> | string,
  merge: MergeType,
  emit: Emit,
  report: ReportError,
  signal: AbortSignal,
  cleanup: () => void,
): Promise<void> {
  let html: string;
  try {
    html = await abortable(renderFlow(value), signal);
  } catch (renderError) {
    await report("fragment", renderError);
    return;
  } finally {
    cleanup();
  }

  // The render finished, but past the deadline: treat it like a render error
  // rather than emit content the client may already have given up on waiting for.
  if (signal.aborted) {
    await report("fragment", signal.reason);
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
  iterable: AsyncIterable<JSX.Element | string>,
  merge: MergeType,
  emit: Emit,
  report: ReportError,
  signal: AbortSignal,
): Promise<void> {
  const it = iterable[Symbol.asyncIterator]();

  // `fatal`: true for a failed emit, false for an iteration/render problem,
  // only the former propagates, the latter routes to emitError.
  let fatal = false;
  let completed = false;

  try {
    while (true) {
      if (signal.aborted) break;
      const step = Promise.resolve(it.next());
      const r = await abortable(step, signal);
      if (r.done) {
        completed = true;
        break;
      }

      let raw: string;
      try {
        raw = await abortable(renderFlow(r.value), signal);
      } catch (renderError) {
        try {
          await report("stream", renderError);
        } catch (error) {
          fatal = true;
          throw error;
        }
        if (signal.aborted) break;
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
    await report("stream", error);
  } finally {
    if (!completed) {
      // A generator may queue return() behind a next() that never settles.
      // Request cleanup without letting uncooperative user work block cancellation.
      try {
        const closing = Promise.resolve(it.return?.(undefined)).catch(() => {});
        if (!signal.aborted) await closing;
      } catch {}
    }
  }
}
