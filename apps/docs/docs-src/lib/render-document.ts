import { renderToString, withScope, type JSX } from "@vincle/core";

/** A post-render HTML transform: receives the assembled document, returns the next. */
export type Transform = (html: string) => string;

export function composeTransforms(
  ...transforms: Array<Transform | false | null | undefined>
): Transform {
  const fns = transforms.filter(Boolean) as Transform[];
  return (html) => fns.reduce((acc, t) => t(acc), html);
}

/**
 * Render one page in its own scope, then apply `transforms` to the assembled
 * HTML. Per-page context (`setDocs`, `setVite`) must be set inside `node`.
 */
export function renderDocument(
  node: () => JSX.Element,
  options: { transforms?: Transform[] } = {},
): Promise<string> {
  return withScope(async () => {
    const html = await renderToString(node());
    return composeTransforms(...(options.transforms ?? []))(html);
  });
}
