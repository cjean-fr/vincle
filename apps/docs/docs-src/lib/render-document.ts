import { renderToString, withScope, type VincleNode } from "@vincle/core";

/** A post-render HTML transform: receives the assembled document, returns the next. */
export type Transform = (html: string) => string;

/**
 * Compose post-render transforms left-to-right into one. Falsy entries are
 * skipped, so a conditional transform can be spliced in inline.
 *
 * @example
 * composeTransforms(injectToc, prod && injectAnalytics);
 */
export function composeTransforms(
  ...transforms: Array<Transform | false | null | undefined>
): Transform {
  const fns = transforms.filter(Boolean) as Transform[];
  return (html) => fns.reduce((acc, t) => t(acc), html);
}

/**
 * Render one page to an HTML string in its own render scope, then apply
 * post-render `transforms` in order.
 *
 * The scope isolates per-page context (`setDocs` / `setVite`): set it *inside*
 * `node`, before returning the tree, so each page renders independently.
 * Transforms run on the assembled HTML — use them for passes that need the
 * rendered output (e.g. TOC extraction from heading ids).
 *
 * @example
 * const html = await renderDocument(
 *   () => {
 *     setDocs({ ... });
 *     return Layout({ children: page });
 *   },
 *   { transforms: [(h) => injectToc(h, renderTocHtml)] },
 * );
 */
export function renderDocument(
  node: () => VincleNode,
  options: { transforms?: Transform[] } = {},
): Promise<string> {
  return withScope(async () => {
    const html = await renderToString(node());
    return composeTransforms(...(options.transforms ?? []))(html);
  });
}
