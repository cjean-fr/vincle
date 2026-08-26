import type { Adapter } from "./adapters/index.js";
import type { OnError, TemplateContent } from "./types.js";

import { Template } from "./components/Template.js";
import { renderToStatic } from "./static.js";

export interface RenderFragmentOptions {
  /** Wire-format adapter — the same one the site's full build uses. */
  adapter: Adapter;
  /**
   * Fragment URL convention. Must match the full build's `generatePath`, or
   * the file lands somewhere the shell's placeholder doesn't reference.
   * Default: `(id) => \`/fragments/${id}.html\``.
   */
  generatePath?: (id: string) => string;
  /** Per-render timeout in ms, forwarded to the underlying `<Template>`. */
  timeout?: number;
  onError?: OnError;
}

/**
 * Render a single fragment on demand, outside a full site build — given
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
  content: TemplateContent,
  opts: RenderFragmentOptions,
): Promise<{ url: string; html: string }> {
  let result: { url: string; html: string } | undefined;

  await renderToStatic(
    async (ctx) => {
      await ctx.renderPage(() => (
        <Template target={id} timeout={opts.timeout} onError={opts.onError}>
          {content}
        </Template>
      ));
      await ctx.emitFragments((fragmentId, url, html) => {
        if (fragmentId === id) result = { url, html };
      });
    },
    { adapter: opts.adapter, generatePath: opts.generatePath },
  );

  if (!result) {
    throw new Error(`[vincle/flow] renderFragment("${id}") produced no output.`);
  }
  return result;
}
