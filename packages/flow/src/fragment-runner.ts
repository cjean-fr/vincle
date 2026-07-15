import { renderToString, type VNode } from "@vincle/core";

import type { TemplateEntry } from "./template-store.js";
import type { FlowEvent, FlowOptions, TemplateContent } from "./types.js";

import { resolveAssets, type AssetState } from "./assets.js";
import { createTimeoutSignal } from "./timeout.js";

const isAsyncIterable = (v: unknown): v is AsyncIterable<VNode> =>
  v != null && typeof (v as any)[Symbol.asyncIterator] === "function";

const isFactory = (c: TemplateContent): c is (signal: AbortSignal) => VNode =>
  typeof c === "function";

type ClassificationResult =
  | { kind: "value"; value: VNode }
  | { kind: "stream"; iterable: AsyncIterable<VNode> }
  | { kind: "sync-error"; error: unknown };

function classifyEntry(entry: TemplateEntry, factorySignal: AbortSignal): ClassificationResult {
  try {
    const value = isFactory(entry.content) ? entry.content(factorySignal) : entry.content;
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

export type FragmentResult = { stream: boolean; done: Promise<void> };

/**
 * Resolve a single template entry: create the timer+signal, invoke the
 * factory (if any), classify the result, and return the work.
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
  assets?: AssetState | null,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;
  const { factorySignal, cleanup } = createTimeoutSignal(
    entry.timeout ?? opts.defaultTimeout,
    opts.signal,
    id,
  );

  const classification = classifyEntry(entry, factorySignal);

  switch (classification.kind) {
    case "sync-error": {
      cleanup();
      return {
        stream: false,
        done: emitError(emit, handle, id, "fragment", classification.error),
      };
    }
    case "stream": {
      cleanup();
      return {
        stream: true,
        done: runStream(id, classification.iterable, entry.merge, emit, handle, opts, assets),
      };
    }
    case "value": {
      const done = (async () => {
        try {
          const raw = await renderToString(classification.value);
          const html = assets ? await resolveAssets(raw, assets) : raw;
          await emit({
            type: "fragment",
            id,
            html,
            merge: entry.merge,
          });
        } catch (error) {
          await emitError(emit, handle, id, "fragment", error);
        } finally {
          cleanup();
        }
      })();
      return { stream: false, done };
    }
  }
}

async function runStream(
  id: string,
  iterable: AsyncIterable<VNode>,
  merge: TemplateEntry["merge"],
  emit: (ev: FlowEvent) => Promise<void>,
  onError: FlowOptions["onError"],
  opts: FlowOptions,
  assets?: AssetState | null,
): Promise<void> {
  const it = iterable[Symbol.asyncIterator]();
  const aborted = opts.signal
    ? new Promise<IteratorResult<VNode>>((resolve) => {
        const onAbort = () => resolve({ done: true, value: undefined });
        if (opts.signal!.aborted) onAbort();
        else opts.signal!.addEventListener("abort", onAbort, { once: true });
      })
    : null;
  try {
    while (true) {
      const step = Promise.resolve(it.next());
      if (aborted) step.catch(() => {});
      const r = await (aborted ? Promise.race([step, aborted]) : step);
      if (r.done) break;
      const raw = await renderToString(r.value);
      const html = assets ? await resolveAssets(raw, assets) : raw;
      await emit({
        type: "fragment",
        id,
        html,
        merge,
      });
    }
  } catch (error) {
    await emitError(emit, onError, id, "stream", error);
  } finally {
    if (opts.signal?.aborted) await it.return?.(undefined).catch(() => {});
  }
}
