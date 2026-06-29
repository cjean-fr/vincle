# @vincle/vite-plugin-precompile

Vite plugin that precompiles lowercase (native HTML) JSX elements into Deno-style `jsxTemplate` tagged template literals.

Wraps a TypeScript transformer that precompiles lowercase (native HTML) JSX elements into Deno-style `jsxTemplate` tagged template literals. The transformer is also exposed as `@vincle/vite-plugin-precompile/transformer` for programmatic use.

## Install

```sh
npm install @vincle/vite-plugin-precompile -D
# or: bun add -D, yarn add -D, pnpm add -D
```

Requires `vite` >= 5 as a peer dependency.

## Usage

### Default

```ts
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vincle/core"
  }
}
```

```ts
// vite.config.ts
import precompile from "@vincle/vite-plugin-precompile";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [precompile()],
});
```

You can also set `esbuild: { jsxImportSource: "@vincle/core" }` in `vite.config.ts` instead of tsconfig. Vite reads either way and exposes it via `resolvedConfig.esbuild.jsxImportSource`.

### With Preact

```ts
// vite.config.ts
import precompile from "@vincle/vite-plugin-precompile";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsxImportSource: "preact" },
  plugins: [
    precompile(), // auto-detected → "preact/jsx-runtime"
    preact(),
  ],
});
```

```ts
// vite.config.ts
import precompile from "@vincle/vite-plugin-precompile";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [precompile()],
});
```

The plugin uses `jsxImportSource` from Vite's resolved esbuild config (which Vite reads from `tsconfig.json` or `vite.config.ts`) to determine the runtime helpers path (`{source}/jsx-runtime`). If that isn't set either, it falls back to `@vincle/core/jsx-runtime`.

`runtimeSource` option always wins when provided.

### With Preact

```ts
// vite.config.ts
import precompile from "@vincle/vite-plugin-precompile";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    precompile(), // auto-detected from tsconfig → "preact/jsx-runtime"
    preact(),
  ],
});
```

### With any runtime (explicit)

```ts
precompile({ runtimeSource: "custom/jsx-runtime" });
// explicit — overrides both jsxImportSource and default
```

## API

### `PluginConfig`

```ts
interface PluginConfig {
  runtimeSource?: string; // default: auto-detected from esbuild.jsxImportSource + "/jsx-runtime"
}
```

### Default export

```ts
function vitePrecompile(config?: PluginConfig): Plugin;
```

Returns a Vite plugin with `enforce: "pre"` — runs before esbuild/Vite's own transforms.

### `PluginConfig`

```ts
interface PluginConfig {
  runtimeSource?: string; // default: "@vincle/core/jsx-runtime"
}
```

## Standalone transformer

The underlying TypeScript transformer is exposed for programmatic use:

```ts
import transformer from "@vincle/vite-plugin-precompile/transformer";
import ts from "typescript";

const result = ts.transform(sourceFile, [
  transformer(program, { runtimeSource: "preact/jsx-runtime" }),
]);
```

This is the same transformer used internally by the Vite plugin.

## How it works

- `enforce: "pre"` — runs before esbuild/Vite's own transforms
- Reads `jsxImportSource` from Vite's resolved esbuild config during `configResolved`
- Only transforms `.tsx`/`.jsx` files (skips `node_modules`)
- Skips files that don't contain `<` (no JSX)
- The underlying TS transformer handles element-level decisions (lowercase only, skip spread/innerHTML)
- Emits `jsxTemplate\`<div>\${jsxEscape(expr)}\</div>\`` with auto-imported runtime helpers

## Test

```sh
bun test   # 9 tests (integration with Vite build pipeline)
```

## License

MIT
