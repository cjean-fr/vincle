import type { Adapter } from "./adapters/index.js";
import type { DeferContent, OnError } from "./types.js";

import { Defer } from "./components/Defer.js";
import { assertAdapter, assertFlowOptions, PREFIX } from "./config.js";
import { ERR_FLOW_NO_ADAPTER, ERR_FLOW_NO_FRAGMENT, vincleError } from "./errors.js";
import { renderToStatic } from "./static.js";

export interface RenderFragmentOptions {
  /** Wire-format adapter: the same one the site's full build uses. */
  adapter: Adapter;
  /**
   * Fragment URL convention. Must match the full build's `generatePath`, or
   * the file lands somewhere the shell's placeholder doesn't reference.
   * Default: `(id) => \`/fragments/${id}.html\``.
   */
  generatePath?: (id: string) => string;
  /** Per-render timeout in ms, forwarded to the underlying `<Defer>`. */
  timeout?: number;
  onError?: OnError;
}

/**
 * Render a single fragment on demand, outside a full site build: given
 * fresh content, produces the exact bytes `emitFragments` would have written
 * for this `id` during a full build, at the same URL. The page that includes
 * it (via `Include`/`Frame`) never needs rebuilding.
 *
 * Framework- and host-agnostic: write `html` to `url` yourself, or hand both
 * to whatever partial-update mechanism your host offers (Netlify Blobs,
 * Vercel on-demand revalidation, a CDN purge + upload…).
 */
export async function renderFragment(
  id: string,
  content: DeferContent,
  opts: RenderFragmentOptions,
): Promise<{ url: string; html: string }> {
  // Fail fast on the options, before a single byte is rendered.
  if (opts.adapter === undefined) {
    throw vincleError(
      `${PREFIX} renderFragment: opts.adapter is required: pass the same adapter the site's ` +
        "full build uses (e.g. TurboAdapter).",
      ERR_FLOW_NO_ADAPTER,
    );
  }
  assertAdapter(opts.adapter, "renderFragment");
  assertFlowOptions(opts, "renderFragment");

  let result: { url: string; html: string } | undefined;

  await renderToStatic(
    async (ctx) => {
      await ctx.renderPage(() => (
        <Defer target={id} timeout={opts.timeout} onError={opts.onError}>
          {content}
        </Defer>
      ));
      await ctx.emitFragments((fragmentId, url, html) => {
        if (fragmentId === id) result = { url, html };
      });
    },
    { adapter: opts.adapter, generatePath: opts.generatePath },
  );

  if (!result) {
    throw vincleError(
      `${PREFIX} renderFragment("${id}"): produced no output for this id. ` +
        "The fragment was never registered or rendered: its content may have thrown or timed out " +
        "(check the onError/console log), or the id differs from the <Defer target> that was " +
        "rendered. Verify the id matches and that the content renders.",
      ERR_FLOW_NO_FRAGMENT,
    );
  }
  return result;
}
