import { raw, renderToString, jsx, type JSX, type Renderable } from "@vincle/core";

import type { CspService } from "./service.js";

export type ScriptProps = Omit<
  JSX.IntrinsicElements["script"],
  "children" | "dangerouslySetInnerHTML"
> & {
  children?: Renderable;
};

/** Ordinary script rendering, without CSP registration or required context. */
export function Script({ children, ...attrs }: ScriptProps) {
  return jsx("script", { ...attrs, children });
}

/** Opt in to inline hash authorization with an explicit per-response service. */
export function withHash(component: typeof Script, csp: CspService) {
  if (component !== Script) throw new TypeError("withHash supports the Script component only.");

  return async function HashedScript(props: ScriptProps) {
    const html = await renderToString(component(props));
    // External scripts are governed by the configured sources, not inline hashes.
    if (props.src == null) {
      const opening = html.match(/^<script(?:[^">]|"[^"]*")*>/)![0];
      await csp.addScript(html.slice(opening.length, -"</script>".length));
    }
    // Reuse only markup already protected by Vincle; children are rendered once.
    return raw(html);
  };
}
