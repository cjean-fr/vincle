# @vincle/precompile

Compile native JSX elements to template literals at build time, reducing
allocations during rendering. Supports Vincle, Preact and Hono runtimes.

## Install

```sh
bun add -D @vincle/precompile
pnpm add -D @vincle/precompile
npm install -D @vincle/precompile
```

## Usage

For JSX modules processed by Vite:

```ts
// vite.config.ts
import precompile from "@vincle/precompile/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [precompile()],
});
```

The plugin reads the runtime from Vite's own resolved configuration:
`oxc.jsx.importSource` on Vite 8, including an `esbuild.jsxImportSource` that
Vite converted because `esbuild.jsx` is `"automatic"`. On Vite 5–7, where the
resolved config has no `oxc`, it falls back to `esbuild.jsxImportSource`.
`oxc: false`, `jsx: "preserve"`, a classic runtime and an empty source leave no
runtime to detect, and on Vite 8 an `esbuild.jsxImportSource` the compiler
ignores is not used either. When genuine JSX reaches a build with no detected
runtime, the build fails instead of guessing; a `.tsx` with no JSX is left
alone. `jsxImportSource` in tsconfig alone is not exposed by Vite's config
resolution: set the plugin's `runtimeSource` explicitly in that case.

For a Bun server that imports JSX directly:

```ts
import precompile from "@vincle/precompile/bun";
// preload.ts
import { plugin } from "bun";

plugin(precompile());
```

```sh
bun --preload ./preload.ts server.tsx
```

The Bun plugin defaults to `@vincle/core/jsx-runtime`. Both plugins accept
`runtimeSource` to select another compatible runtime. React is unsupported.
With Vincle, static attributes are sanitized at build time.

The default export of `@vincle/precompile` is the standalone transform for
custom build pipelines.

[Documentation](https://vincle.cjean.fr/integration/precompile)

MIT © Christophe Jean
