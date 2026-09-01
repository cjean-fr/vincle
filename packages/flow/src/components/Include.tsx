import { useContext, type JSX, type VNode } from "@vincle/core";
import { schemeOf } from "@vincle/core/html";

import { PREFIX } from "../config.js";
import { Flow, renderPlaceholder } from "../context.js";

// Include fetches an HTML fragment, so its `src` is a strict whitelist:
// http(s) or a relative path only.
//
// The types below are the *compile-time* mirror of `isAllowedUrl`; the runtime
// authority is `schemeOf` in `@vincle/core/html`. TypeScript cannot call it, so
// the rule is restated in the type system — and only there.
type SchemeOf<S extends string> = S extends `${infer Head}:${string}`
  ? Head extends `${string}${"/" | "?" | "#"}${string}`
    ? null
    : Head extends ""
      ? null
      : Head
  : null;

type FetchUrl<S extends string> =
  SchemeOf<S> extends null
    ? S
    : Lowercase<SchemeOf<S> & string> extends "http" | "https"
      ? S
      : {
          __error: "Include needs an HTML URL — only http(s): or a relative path";
        };

export interface IncludeProps<S extends string = string> {
  src: S & FetchUrl<S>;
  fallback?: VNode;
}

/**
 * Delegates to `schemeOf` (`@vincle/core/html`) rather than a private
 * `indexOf(":")` re-implementation, which diverged from the WHATWG parser on
 * two fronts: it never normalised tabs/newlines/C0 controls, and it looked for
 * `?` after the colon instead of before it, rejecting `?a:b` — a scheme-less
 * relative reference — as forbidden. Both were fail-closed on a whitelist
 * policy, so nothing broke, but a second copy of the rule is still to avoid.
 */
function isAllowedUrl(url: string): boolean {
  const scheme = schemeOf(url);
  // No scheme: a relative reference, resolved against the page. Nothing to judge.
  if (scheme === undefined) return true;
  return scheme === "http" || scheme === "https";
}

export function Include<const S extends string>(props: IncludeProps<S>): JSX.Element {
  const { nextId } = useContext(Flow);

  if (!isAllowedUrl(props.src)) {
    const scheme = schemeOf(props.src);
    throw new Error(
      `${PREFIX} <Include src="${props.src}">: forbidden scheme${
        scheme !== undefined ? ` ${JSON.stringify(scheme)}` : ""
      } — only http(s): or relative paths are allowed. ` +
        'Use an absolute http(s) URL or a path relative to the page, e.g. src="/fragments/hero.html".',
    );
  }

  return renderPlaceholder(nextId(), props.fallback, props.src);
}
