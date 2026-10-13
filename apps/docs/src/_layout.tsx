import type { Renderable } from "@vincle/core";
import type { PageContext } from "@vincle/ssg";

import { setDocs, type DocsRenderContext } from "./lib/context.js";
import { useToc } from "./lib/toc.js";

/** SSG selects this layout and owns rendering; docs supply their navigation context. */
export default async function DocumentationLayout({
  children,
  meta,
}: PageContext & { children: Renderable }) {
  const resolveContext = meta["documentation"] as (() => Promise<DocsRenderContext>) | undefined;
  if (!resolveContext) throw new Error("Documentation layout requires its discovery context.");
  const documentation = await resolveContext();
  setDocs({ ...documentation, toc: useToc() });
  return documentation.config.layout({
    children: meta["prose"] ? <div class="docs-prose">{children}</div> : children,
  });
}
