# @vincle/precompile-core

AST-agnostic shared helpers for JSX precompile transforms. Used by `@vincle/vite-plugin-precompile`.

## Install

```sh
npm install @vincle/precompile-core
# or: bun add, yarn add, pnpm add
```

This is a library package — you typically don't use it directly unless you're building a custom precompile plugin.

## API

### `isLower(s: string): boolean`

Returns `true` if the first character is a lowercase letter (i.e. would make a lowercase tag name).

### `isLowercaseTag(name: string): boolean`

Alias for `isLower`. Explicit semantic name for tag checks.

### `normalizeText(text: string): string`

Normalizes JSX whitespace to match browser rendering:

- Strips leading/trailing newlines
- Replaces internal newlines with spaces

### `hasSpreadOrInnerHTML(attrs: Iterable<AttrBrief>): boolean`

Returns `true` if any attribute is a spread (`{...x}`) or `dangerouslySetInnerHTML`. Elements with either should skip precompile and delegate to the JSX runtime.

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
