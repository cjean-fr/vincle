/**
 * workerd conformance entry point.
 *
 * A Worker has neither `process` nor an exit code: it responds instead. The
 * status carries the verdict (200 / 500) so a plain `curl --fail` is enough
 * in CI.
 *
 * `nodejs_compat` is required — it's what gives workerd `AsyncLocalStorage`,
 * so it's what `wrangler.jsonc` enables. Without that flag, `@vincle/core`
 * falls back to `SyncContextStore`, and the "two concurrent scopes" case sees
 * an explicit refusal instead of isolation — both count as success, and
 * that's exactly the distinction this file exists to observe.
 */
import { report, runConformance } from "./suite.ts";

export default {
  async fetch(): Promise<Response> {
    const result = await runConformance();
    console.log(report(result));
    return new Response(JSON.stringify(result, null, 2), {
      status: result.failures.length > 0 ? 500 : 200,
      headers: { "content-type": "application/json" },
    });
  },
};
