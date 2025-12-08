import { renderToString, type JSX } from "@vincle/core";
// The protocol test is core's — same predicate the tree walk dispatches on, so
// "what counts as a stream" cannot mean one thing here and another there. The
// local copy it replaces needed an `as any` to ask the question at all.
import { isAsyncIterable } from "@vincle/core/html";

import type { TemplateEntry } from "./template-store.js";
import type { FlowEvent, FlowOptions, TemplateContent } from "./types.js";

import { createTimeoutSignal } from "./timeout.js";

const isLazyFactory = (
  c: TemplateContent,
): c is ((signal: AbortSignal) => JSX.Element) | ((signal: AbortSignal) => AsyncIterable<JSX.Element>) =>
  typeof c === "function";

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

async function emitError(
  emit: (ev: FlowEvent) => Promise<void>,
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

type FragmentResult = { stream: boolean; done: Promise<void> };

/**
 * Resolve a single template entry: classify the content and return the work.
 *
 * The returned `{ stream, done }` pair lets the drain loop route one-shots
 * (barrier) vs streams (run concurrently). Classification is synchronous so
 * the caller never has to await a plain value to classify it.
 */
export function runFragment(
  id: string,
  entry: TemplateEntry,
  emit: (ev: FlowEvent) => Promise<void>,
  opts: FlowOptions,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;
  const { signal, cleanup } = createTimeoutSignal(entry.timeout ?? opts.defaultTimeout, opts.signal, id);

  const classification = classifyEntry(entry, signal);

  switch (classification.kind) {
    case "sync-error": {
      cleanup();
      return {
        stream: false,
        done: emitError(emit, handle, id, "fragment", classification.error),
      };
    }
    case "stream": {
      return {
        stream: true,
        done: runStream(id, classification.iterable, entry.merge, emit, handle, signal).finally(cleanup),
      };
    }
    case "value": {
      const done = (async () => {
        let html: string;
        try {
          html = await renderToString(classification.value);
        } catch (renderError) {
          // A render error routes to the error handler; if emitError itself
          // throws (the channel is broken), propagate the original.
          try {
            await emitError(emit, handle, id, "fragment", renderError);
          } catch {
            throw renderError;
          }
          return;
        } finally {
          cleanup();
        }

        // The render finished, but past the deadline — treat it like a render
        // error rather than emit content the client may already have given up
        // on waiting for.
        if (signal.aborted) {
          try {
            await emitError(emit, handle, id, "fragment", signal.reason);
          } catch {
            throw signal.reason;
          }
          return;
        }

        // A failed emit is fatal — no emitError attempt here, since a broken
        // channel can't emit the fallback either.
        try {
          await emit({
            type: "fragment",
            id,
            html,
            merge: entry.merge,
          });
        } catch (emitError_) {
          console.error(`[vincle/flow] Failed to emit fragment "${id}"`, emitError_);
          throw emitError_;
        }
      })();
      return { stream: false, done };
    }
  }
}

async function runStream(
  id: string,
  iterable: AsyncIterable<JSX.Element>,
  merge: TemplateEntry["merge"],
  emit: (ev: FlowEvent) => Promise<void>,
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
        try {
          await emitError(emit, onError, id, "stream", renderError);
        } catch {
          throw renderError;
        }
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
    try {
      await emitError(emit, onError, id, "stream", error);
    } catch {
      throw error; // emitError itself failed — propagate
    }
  } finally {
    if (signal.aborted) await it.return?.(undefined).catch(() => {});
  }
}
