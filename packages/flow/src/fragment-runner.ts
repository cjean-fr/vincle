import { renderToString, type JSX } from "@vincle/core";

import type { TemplateEntry } from "./template-store.js";
import type { FlowEvent, FlowOptions, TemplateContent } from "./types.js";

import { resolveAssets, type AssetState } from "./assets.js";
import { createTimeoutSignal } from "./timeout.js";

const isAsyncIterable = (v: unknown): v is AsyncIterable<JSX.Element> =>
  v != null && typeof (v as any)[Symbol.asyncIterator] === "function";

const isLazyFactory = (
  c: TemplateContent,
): c is (() => JSX.Element) | (() => AsyncIterable<JSX.Element>) => typeof c === "function";

type ClassificationResult =
  | { kind: "value"; value: JSX.Element | string }
  | { kind: "stream"; iterable: AsyncIterable<JSX.Element> }
  | { kind: "sync-error"; error: unknown };

function classifyEntry(entry: TemplateEntry): ClassificationResult {
  try {
    const value = isLazyFactory(entry.content) ? entry.content() : entry.content;
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
  assets?: AssetState | null,
): FragmentResult {
  const handle = entry.onError ?? opts.onError;
  const { cleanup } = createTimeoutSignal(entry.timeout ?? opts.defaultTimeout, opts.signal, id);

  const classification = classifyEntry(entry);

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
        let html: string;
        try {
          const raw = await renderToString(classification.value);
          html = assets ? await resolveAssets(raw, assets) : raw;
        } catch (renderError) {
          // Erreur de rendu du template → routée vers l'error handler.
          // Si emitError jette (emit toujours cassé), on propage.
          try {
            await emitError(emit, handle, id, "fragment", renderError);
          } catch {
            throw renderError;
          }
          return;
        }

        // Émission : si ça jette, c'est fatal (output channel cassé).
        // On ne tente pas emitError ici — si on peut pas émettre le
        // contenu, on peut pas émettre le fallback non plus.
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
  iterable: AsyncIterable<JSX.Element>,
  merge: TemplateEntry["merge"],
  emit: (ev: FlowEvent) => Promise<void>,
  onError: FlowOptions["onError"],
  opts: FlowOptions,
  assets?: AssetState | null,
): Promise<void> {
  const it = iterable[Symbol.asyncIterator]();
  const aborted = opts.signal
    ? new Promise<IteratorResult<JSX.Element>>((resolve) => {
        const onAbort = () => resolve({ done: true, value: undefined });
        if (opts.signal!.aborted) onAbort();
        else opts.signal!.addEventListener("abort", onAbort, { once: true });
      })
    : null;

  // fatal indique si l'erreur vient d'un échec d'émission (vrai) ou
  // d'un problème d'itération/rendu (faux). Seules les premières sont
  // fatales — les secondes sont routées vers emitError.
  let fatal = false;

  try {
    while (true) {
      const step = Promise.resolve(it.next());
      if (aborted) step.catch(() => {});
      const r = await (aborted ? Promise.race([step, aborted]) : step);
      if (r.done) break;

      // 1. Rendu — erreur → emitError, on saute le chunk
      let raw: string;
      try {
        raw = await renderToString(r.value);
        if (assets) raw = await resolveAssets(raw, assets);
      } catch (renderError) {
        try {
          await emitError(emit, onError, id, "stream", renderError);
        } catch {
          throw renderError;
        }
        continue;
      }

      // 2. Émission — si ça jette, le canal de sortie est cassé
      try {
        await emit({ type: "fragment", id, html: raw, merge });
      } catch (emitErr) {
        console.error(`[vincle/flow] Failed to emit stream chunk for "${id}"`, emitErr);
        fatal = true;
        throw emitErr;
      }
    }
  } catch (error) {
    if (fatal) throw error; // émission cassée → propager directement
    // Itération/rendu : tenter emitError, puis arrêt propre
    try {
      await emitError(emit, onError, id, "stream", error);
    } catch {
      throw error; // emitError a lui-même échoué → propager
    }
  } finally {
    if (opts.signal?.aborted) await it.return?.(undefined).catch(() => {});
  }
}
