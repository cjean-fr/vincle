import type { TemplateStore } from "./template-store.js";
import type { FlowEvent, FlowOptions } from "./types.js";

import { runFragment } from "./fragment-runner.js";

/**
 * Await all promises via `allSettled`, then throw the first rejection found.
 * Unlike `Promise.all`, this waits for every promise to settle before throwing,
 * so in-flight work isn't orphaned. Rejection reasons come from emit failures
 * (output channel broken) — they are fatal for the entire flush.
 */
async function settleOrThrow(promises: Promise<void>[]): Promise<void> {
  if (promises.length === 0) return;
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "rejected") throw r.reason;
  }
}

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
 *
 * The primitive owns the drain only: asset policy and fragment framing belong to
 * the caller — `adapter.Patch` plus dedupe against the shell's own `ctx.assets`
 * for streaming, `adapter.Frame` plus `suppressFlowAssets()` for static output.
 * A previous `assets` parameter tried to own them here too; no caller ever
 * passed it, and the branch it fed was dead.
 */
export async function flushTemplates(
  ctx: { templateStore: TemplateStore },
  emit: (ev: FlowEvent) => Promise<void>,
  opts: FlowOptions = {},
): Promise<void> {
  const processed = new Set<string>();
  const live: Promise<void>[] = [];

  while (!opts.signal?.aborted) {
    const wave = ctx.templateStore.outstanding(processed);
    if (wave.length > 0) {
      const oneShots: Promise<void>[] = [];
      for (const [id, entry] of wave) {
        processed.add(id);
        const { isStreaming, done } = runFragment(id, entry, emit, opts);
        (isStreaming ? live : oneShots).push(done);
      }
      await settleOrThrow(oneShots);
      continue;
    }
    if (live.length === 0) break;
    await settleOrThrow(live);
    live.length = 0;
    if (!ctx.templateStore.hasOutstanding(processed)) break;
  }
  if (live.length > 0) await settleOrThrow(live);
}
