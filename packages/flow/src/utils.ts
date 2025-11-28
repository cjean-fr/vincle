import type { ShellContext } from "./adapters/shared.js";

const REGEX_FRAGMENT_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function assertFragmentId(id: string, label: string): void {
  if (!REGEX_FRAGMENT_ID.test(id)) {
    throw new Error(
      `${label}: "${id}" is not a valid fragment id. Use letters, digits, hyphens and underscores only, starting with a letter.`,
    );
  }
}

/**
 * Injects `content` immediately before `</head>`, opening a `<head>` if the
 * shell has none.
 *
 * Four placements, in decreasing order of what the shell tells us:
 *
 *   1. before `</head>` — the shell said where its head is;
 *   2. just after `<html …>` — wherever it sits, not only at offset 0;
 *   3. just after a leading doctype — a fragment shell that still declares one;
 *   4. at the front — a bare fragment, nothing to preserve.
 *
 * Cases 2 and 3 used to be one `html.startsWith("<html")` test, and a shell
 * that opened with a doctype matched neither branch: the content was prepended
 * *before* the doctype. Nothing may precede a doctype — a browser that sees
 * markup first ignores it and renders the page in quirks mode.
 */
export function injectIntoHead(html: string, content: string): string {
  const closingHead = html.match(/<\/head\s*>/i);
  if (closingHead) {
    const idx = closingHead.index!;
    return html.slice(0, idx) + content + html.slice(idx);
  }

  const head = `<head>${content}</head>`;

  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (htmlTag) return spliceAt(html, htmlTag.index! + htmlTag[0].length, head);

  const doctype = html.match(/^\s*<!doctype\b[^>]*>/i);
  if (doctype) return spliceAt(html, doctype[0].length, head);

  return head + html;
}

const spliceAt = (html: string, at: number, insert: string): string =>
  html.slice(0, at) + insert + html.slice(at);

/**
 * Compose shell transforms left-to-right into a single `transformShell`. Each
 * transform receives the output of the previous one; falsy entries are skipped,
 * so an adapter's own (possibly `undefined`) transform can be spliced in:
 *
 * Each transform receives the active `ShellContext` as its second argument, so a
 * fragment-aware transform (e.g. NativeAdapter's polyfill injection) still sees
 * the pending fragment count; transforms that don't need it simply ignore it.
 *
 * @example
 * createAdapter({
 *   ...NativeAdapter,
 *   transformShell: composeShell(NativeAdapter.transformShell, metadata(), assets()),
 * });
 */
export function composeShell(
  ...transforms: Array<((shell: string, ctx: ShellContext) => string) | undefined | null | false>
): (shell: string, ctx: ShellContext) => string {
  const fns = transforms.filter(Boolean) as Array<(shell: string, ctx: ShellContext) => string>;
  return (shell, ctx) => fns.reduce((html, t) => t(html, ctx), shell);
}
