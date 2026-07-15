import type { AssetState } from "./assets.js";
import type { TemplateStore } from "./template-store.js";
import type { FlowEvent, FlowOptions } from "./types.js";

import { runFragment } from "./fragment-runner.js";

/**
 * Drain every registered template entry, emitting semantic `FlowEvent`s to
 * `emit`. Each entry's content is classified at drain time:
 *
 * - an `AsyncIterable` (returned synchronously, or passed directly) is a
 *   **stream** — one patch per item, run in its own `for await` loop so a slow
 *   one never blocks the rest;
 * - anything else is a **one-shot** patch, rendered once.
 *
 * One-shots drain generation by generation, so a nested `<Template>` registered
 * while its parent renders is picked up and emitted after its parent — the
 * order the client patch mechanism needs. The loop continues until full
 * quiescence: streams may register new work while they run, so it only exits
 * once no entry is unprocessed AND every live stream has finished.
 */
export async function flushTemplates(
  ctx: { templateStore: TemplateStore },
  emit: (ev: FlowEvent) => Promise<void>,
  opts: FlowOptions = {},
  assets?: AssetState | null,
): Promise<void> {
  const processed = new Set<string>();
  const live: Promise<void>[] = [];

  while (!opts.signal?.aborted) {
    const wave = ctx.templateStore.outstanding(processed);
    if (wave.length > 0) {
      const oneShots: Promise<void>[] = [];
      for (const [id, entry] of wave) {
        processed.add(id);
        const { stream, done } = runFragment(id, entry, emit, opts, assets);
        (stream ? live : oneShots).push(done);
      }
      await Promise.allSettled(oneShots);
      continue;
    }
    if (live.length === 0) break;
    await Promise.allSettled(live);
    live.length = 0;
    if (!ctx.templateStore.hasOutstanding(processed)) break;
  }
  if (live.length > 0) await Promise.allSettled(live);
}
