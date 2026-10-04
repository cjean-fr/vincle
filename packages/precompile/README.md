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

The plugin detects the runtime from `jsxImportSource`. Vite 5–8 is supported.

For a Bun server that imports JSX directly:

```ts
// preload.ts
import { plugin } from "bun";
import precompile from "@vincle/precompile/bun";

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
