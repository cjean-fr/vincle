import type { FlowContext } from "./context.js";

const REGEX_FRAGMENT_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function assertFragmentId(id: string, label: string): void {
  if (!REGEX_FRAGMENT_ID.test(id)) {
    throw new Error(
      `${label}: "${id}" is not a valid fragment id. Use letters, digits, hyphens and underscores only, starting with a letter.`,
    );
  }
}

/** Injects `content` immediately before `</head>`, or wraps in `<head>` if absent. */
export function injectIntoHead(html: string, content: string): string {
  const match = html.match(/<\/head\s*>/i);
  if (match) {
    const idx = match.index!;
    return html.slice(0, idx) + content + html.slice(idx);
  }
  return html.startsWith("<html")
    ? html.replace(/(<html[^>]*>)/i, `$1<head>${content}</head>`)
    : `<head>${content}</head>${html}`;
}

/**
 * Compose shell transforms left-to-right into a single `transformShell`. Each
 * transform receives the output of the previous one; falsy entries are skipped,
 * so an adapter's own (possibly `undefined`) transform can be spliced in:
 *
 * Each transform receives the active `FlowContext` as its second argument, so a
 * fragment-aware transform (e.g. NativeAdapter's polyfill injection) still sees
 * the flow state; transforms that don't need it simply ignore it.
 *
 * @example
 * createAdapter({
 *   ...NativeAdapter,
 *   transformShell: composeShell(NativeAdapter.transformShell, metadata(), assets()),
 * });
 */
export function composeShell(
  ...transforms: Array<
    | ((shell: string, ctx: FlowContext) => string | Promise<string>)
    | undefined
    | null
    | false
  >
): (shell: string, ctx: FlowContext) => string | Promise<string> {
  const fns = transforms.filter(Boolean) as Array<
    (shell: string, ctx: FlowContext) => string | Promise<string>
  >;
  return async (shell, ctx) => {
    let html = shell;
    for (const t of fns) {
      html = await t(html, ctx);
    }
    return html;
  };
}
