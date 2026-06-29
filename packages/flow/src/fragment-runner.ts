import type { Pending } from "./pending-store.js";
import { resolveAssets, type AssetState } from "./assets.js";
import type { FlowEvent, FlowOptions } from "./types.js";
import { renderToString, type VincleNode } from "@vincle/core";

const isAsyncIterable = (v: unknown): v is AsyncIterable<VincleNode> =>
  v != null && typeof (v as any)[Symbol.asyncIterator] === "function";

type ClassificationResult =
  | { kind: "value"; value: VincleNode }
  | { kind: "stream"; iterable: AsyncIterable<VincleNode> }
  | { kind: "sync-error"; error: unknown };

function classifyEntry(
  entry: Pending,
  factorySignal: AbortSignal | undefined,
): ClassificationResult {
  try {
    const value = (entry.content as (s: AbortSignal | undefined) => VincleNode)(
      factorySignal,
    );
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
 * Resolve a single deferred entry: create the timer+signal, invoke the
 * factory (if any), classify the result, and return the work.
 *
 * The returned `{ stream, done }` pair lets the drain loop route one-shots
 * (barrier) vs streams (run concurrently). Classification is synchronous so
 * the caller never has to await a plain value to classify it.
 *
 * @example
 * const emit = async (ev) => { /* … *\/ };
 * const { done } = runFragment("my-id", { content: () => <span>hi<\/span>, merge: "replace" }, emit, {});
 * await done;
 */
export function runFragment(
  id: string,
  entry: Pending,
  emit: (ev: FlowEvent) => Promise<void>,
  opts: FlowOptions,
  assets?: AssetState | null,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;

  // Per-entry timeout fires its own controller; combine it with the request
  // signal so the factory aborts on whichever comes first.
  const ms = entry.timeout ?? opts.defaultTimeout;
  const timer = ms != null ? new AbortController() : null;
  const timeout = timer
    ? setTimeout(
        () => timer.abort(new Error(`Defer "${id}" timed out after ${ms}ms`)),
        ms,
      )
    : null;
  const factorySignal =
    opts.signal && timer
      ? AbortSignal.any([opts.signal, timer.signal])
      : (opts.signal ?? timer?.signal);

  const classification = classifyEntry(entry, factorySignal);

  switch (classification.kind) {
    case "sync-error": {
      if (timeout) clearTimeout(timeout);
      return {
        stream: false,
        done: emitError(emit, handle, id, "fragment", classification.error),
      };
    }
    case "stream": {
      if (timeout) clearTimeout(timeout);
      // Streams are long-lived; the per-entry timeout doesn't apply to them.
      return {
        stream: true,
        done: runStream(
          id,
          classification.iterable,
          entry.merge,
          emit,
          handle,
          opts,
          assets,
        ),
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
          if (timeout) clearTimeout(timeout);
        }
      })();
      return { stream: false, done };
    }
  }
}

async function runStream(
  id: string,
  iterable: AsyncIterable<VincleNode>,
  merge: Pending["merge"],
  emit: (ev: FlowEvent) => Promise<void>,
  onError: FlowOptions["onError"],
  opts: FlowOptions,
  assets?: AssetState | null,
): Promise<void> {
  const it = iterable[Symbol.asyncIterator]();
  // A generator parked in next() (e.g. awaiting an event that never fires)
  // would otherwise pin streamFlow forever after abort — race it.
  const aborted = opts.signal
    ? new Promise<IteratorResult<VincleNode>>((resolve) => {
        const onAbort = () => resolve({ done: true, value: undefined });
        if (opts.signal!.aborted) onAbort();
        else opts.signal!.addEventListener("abort", onAbort, { once: true });
      })
    : null;
  try {
    while (true) {
      const step = Promise.resolve(it.next());
      if (aborted) step.catch(() => {}); // ignored if abort wins the race
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
