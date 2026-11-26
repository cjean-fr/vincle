# @vincle/core

## Unreleased

### Changed

- Handle primitive template holes directly while preserving escaping and deferred object evaluation.
- Join synchronous siblings without allocating a promise for each string after a sibling suspends.

### Fixed

- Escape the text of a `<script>` or `<style>` under `<svg>` or `<math>` as ordinary text. The HTML parser reads that text as markup there, so under the raw-text rule a closing tag or an `<img onerror>` in it left the element. The renderer now follows the parser: raw text in HTML, text under `<svg>` and `<math>`, raw text again at the integration points (`foreignObject`, `desc`, `title`, MathML text elements, `annotation-xml` with an HTML encoding). The namespace is carried through components, async results, Providers and template holes, and `raw()` is not rewritten. A `<script>` in a template hole under an `<svg>` written in the template text is read from that text.
- Keep the keyword literals of the generated CSS unions visible to editor completions: length types now take their open string arm as `string & {}` instead of a bare `string`, which absorbed literals like `"auto"` and left value positions without suggestions. Accepted values are unchanged.
- Drop redundant arms from a few generated attribute unions: `download` and `inlist` are `any` without a `RawString` arm, and the native spelling of numeric attributes that already accept `string` (`frameborder`, `cellpadding`, `cellspacing`) no longer adds a `` `${number}` `` arm. Accepted values are unchanged.

### Removed

- **Breaking (behavior)**: the static construction path is gone. `jsx()` no longer pre-renders an all-static subtree to a `RawString`; every element becomes a `VNode` and renders through the tree walk, now the single renderer. Output bytes are unchanged. One observable timing change: a function passed as an attribute value now throws `ERR_VINCLE_FUNCTION_ATTR` at render time instead of at `jsx()` time. `serializeStatic` was package-internal; the exported API is unchanged.

## 0.10.0 — 2026-11-01

### Changed

- Make `JSX.Element` the same union as `Renderable`, so a child or `children` typed `JSX.Element` accepts several children, text, lists, promises and async iterables instead of failing with TS2746. Type node structure as `VNode`; an object child is still a type error.
- **Breaking (behavior)**: sibling subtrees now render concurrently. They still start in document order and their output is still joined in document order, but once a sibling suspends, the remaining siblings start instead of waiting for it. Two consequences for code that relied on sequential execution: a `Scope.set` placed after an `await` in one sibling races with readers in the other siblings (writes before the first `await` stay visible to later siblings), and a sibling that throws or rejects no longer prevents the later siblings from running - `renderToString` rejects at once with that failure, without waiting for the siblings still in flight. The precompiled-template and array paths follow the same rule, so precompiled and dynamic trees still render the same bytes. A fully synchronous tree is unchanged.
- Judge `cite`, `poster`, `background` and `manifest` as URLs, with the scheme allowlist `href` uses: a scheme off it renders as `#blocked`, and `rawUrl()` vouches for one. They accept `rawUrl()` in the JSX types. `ping` and `srcset` hold several URLs and are not judged. Relative references, fragments, `http(s):`, `mailto:`, `tel:`, `sms:` and image `data:` URLs are unchanged.
- Publish the compiled `dist` only, and load it on Bun like on every other runtime: the `bun` export condition that pointed to the TypeScript sources is gone, and `src` is no longer in the package. The package drops from about 109 kB to about 45 kB gzipped, and from 507 kB to 219 kB installed. Runtime behaviour is unchanged; Bun rendering throughput measured within noise (±3%).
- Mark the `typescript` peer dependency as optional, so installing Core no longer downloads the TypeScript compiler and its platform package. The peer range still documents the supported compiler versions for TypeScript consumers, who provide their own.

### Fixed

- Refuse an HTML tag that has both `children` and `dangerouslySetInnerHTML` at construction, with the new `ERR_VINCLE_AMBIGUOUS_HTML_CHILDREN` code: React's rule and exact condition, so `null`/`undefined` children stay legal while `false` refuses. A `null` `dangerouslySetInnerHTML` prop is now treated as absent instead of throwing a bare `TypeError` on `.__html`.
- Export `createElement` for automatic JSX compiler fallback calls after a spread, with positional children taking priority without changing the input props.
- Leave `dangerouslySetInnerHTML` on function components untouched. Only native HTML tags interpret and validate this prop.

- Throw `ERR_VINCLE_FUNCTION_AS_TEXT` when a function is used as a child, in an element, an array, `<script>` or `<style>`, or a template hole. It was written into the HTML as its source code, which could expose server-side code. A component interpolated as `{Comp}` instead of `<Comp />` now fails the same way a VNode does.

## 0.9.1 — 2026-10-05

### Changed

- Escape primitive array entries directly, avoiding intermediate `RawString` allocations.
- Decouple the renderer from context providers so renders without context do not pull in AsyncLocalStorage.
- Add neutral `TemplateHTMLAttributes` and VNode extension interfaces for integration-owned JSX types; Core remains independent of Flow.
- Refresh the README with concise usage and Bun, pnpm, and npm installation commands.

### Fixed

- Serialize `buffer` and `sanitize` as boolean attributes.

Changes since the npm release 0.9.0 (commit `02b6840`).
