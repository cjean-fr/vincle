# @vincle/precompile-core

AST-agnostic shared helpers for JSX precompile transforms. Used by `@vincle/vite-plugin-precompile`.

## Install

```sh
npm install @vincle/precompile-core
# or: bun add, yarn add, pnpm add
```

This is a library package — you typically don't use it directly unless you're building a custom precompile plugin.

## API

### `decodeJsxEntities(text: string): string`

Decodes the HTML entities in a JSX text node the way the JS compilers (Babel/TS/esbuild/Bun) do, so precompiled static text matches the string the runtime path receives. Strict (semicolon-required) decoding; only for non-rawtext content.

### `isLowercaseTag(name: string): boolean`

Returns `true` if the first character is a lowercase letter — i.e. would make a lowercase (native HTML) tag name.

### `collapseJsxWhitespace(text: string): string`

Collapses the whitespace of a JSX text child the way the standard JSX transform does:

- Lines are split on newlines; leading whitespace is stripped from every line but the first, trailing whitespace from every line but the last
- Blank lines are dropped, non-blank lines joined with a single space
- Tabs are treated as spaces
- A text node that is entirely whitespace spanning a newline collapses to `""`

### `hasSpreadOrInnerHTML(attrs: Iterable<AttrBrief>): boolean`

Returns `true` if any attribute is a spread (`{...x}`) or `dangerouslySetInnerHTML`. Elements with either should skip precompile and delegate to the JSX runtime.

### `isVoidElement(tag: string): boolean`

Returns `true` if `tag` is a void HTML element (`img`, `br`, `input`, …) that must not be emitted with closing markup.

### `remapAttrName(name: string): string`

Rewrites a JSX attribute name to its HTML form (`className` → `class`, …). Names not in the map are returned unchanged; the transform applies this at build time so static attributes stay inlined.

### `AttrBrief`

```ts
interface AttrBrief {
  kind: "attribute" | "spread";
  name?: string;
}
```

Minimal attribute descriptor consumed by `hasSpreadOrInnerHTML`.

### `RUNTIME_SOURCE`

```ts
const RUNTIME_SOURCE = "@vincle/core/jsx-runtime";
```

Default runtime import path used when no explicit `runtimeSource` is configured.

## License

MIT
