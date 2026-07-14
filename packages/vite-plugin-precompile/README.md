# @vincle/vite-plugin-precompile

Vite plugin that precompiles lowercase (native HTML) JSX elements into Deno-style `jsxTemplate` tagged template literals.

The underlying transformer is also exposed as `@vincle/vite-plugin-precompile/transformer` for programmatic use.

## Compatible runtimes

| Runtime | `jsxImportSource` | Compatible              |
| ------- | ----------------- | ----------------------- |
| Vincle  | `@vincle/core`    | ✅                      |
| Preact  | `preact`          | ✅                      |
| Hono    | `hono/jsx`        | ✅                      |
| React   | `react`           | ❌ (throws build error) |

React does not export the `jsxTemplate` helper that the precompile transform relies on.

## Install

```sh
npm install @vincle/vite-plugin-precompile -D
```

Requires `vite` >= 5 as a peer dependency.

## Usage

Just add the plugin — no adapter file needed.

```ts
// vite.config.ts
import precompile from "@vincle/vite-plugin-precompile";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [precompile()],
});
```

The plugin automatically detects the runtime from your `jsxImportSource` and wires up the helpers through a virtual module (`virtual:vincle-precompile-runtime`).

### Custom runtime

```ts
precompile({ runtimeSource: "custom/jsx-runtime" });
```

Only needed when using a runtime other than the detected one.

## API

### `PluginConfig`

```ts
interface PluginConfig {
  runtimeSource?: string; // default: virtual:vincle-precompile-runtime → auto-detected
  secure?: boolean; // true (default): sanitize static attributes at build time; false: Deno-compatible, inline verbatim
}
```

### Default export

```ts
function vitePrecompile(config?: PluginConfig): Plugin;
```

Returns a Vite plugin with `enforce: "pre"` — runs before esbuild/Vite's own transforms.

## Standalone transformer

```ts
import transformer from "@vincle/vite-plugin-precompile/transformer";
import ts from "typescript";

const result = ts.transform(sourceFile, [
  transformer(program, { runtimeSource: "preact/jsx-runtime" }),
]);
```

## How it works

- `enforce: "pre"` — runs before esbuild/Vite's own transforms
- Registers a virtual module that re-exports runtime helpers from the detected runtime
- Only transforms `.tsx`/`.jsx` files (skips `node_modules`)
- Skips files without `<` (no JSX)
- Emits `jsxTemplate\`<div>\${expr}\</div>\`` with auto-imported runtime helpers

## Test

```sh
bun test
```

## License

MIT
