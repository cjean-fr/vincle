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
  // Nothing else: which output the transform emits is decided by the runtime's
  // declared precompile dialect, not by an option.
}
```

### Default export

```ts
function vitePrecompile(config?: PluginConfig): Plugin;
```

Returns a Vite plugin with `enforce: "pre"` — runs before esbuild/Vite's own transforms.

## Standalone transformer

The transform is also exposed for programmatic use — it is exactly what the Vite plugin calls internally:

```ts
import precompileTransform from "@vincle/vite-plugin-precompile/transformer";

const result = precompileTransform(
  code, // source text
  "/src/App.tsx", // file id — its extension selects tsx vs jsx
  { runtimeSource: "preact/jsx-runtime" }, // optional PluginConfig
  renderAttr, // optional — build-time attribute serializer
  renderEscape, // optional — build-time content escaper
);
// → { code: string, map: SourceMap } | null (null when nothing to rewrite)

if (result && result.code !== code) {
  // feed result.code to your pipeline, keep result.map
}
```

`renderAttr` / `renderEscape` are the target runtime's own `jsxAttr` / `jsxEscape`. The plugin injects them only for a runtime declaring the `"vincle"` precompile dialect, and that injection _is_ the switch: with them the transform emits its corrected, sanitized output, without them it reproduces Deno's byte for byte. A direct caller decides the same way — pass both to get the corrected output, pass neither for the reference one, where static attributes are trusted and inlined verbatim. There is no `compatibility` option to set: what the runtime declares is the whole decision.

## Deno as the reference

For a runtime that does not declare the `"vincle"` precompile dialect, the
transform reproduces Deno's own `jsx: "precompile"` output, and
`test-fixtures/deno-precompile-trace.json` is what Deno emitted when captured —
every helper call in order, with the names chosen. Pull-request CI compares
against that file, so it needs no Deno installed.

```bash
bun run scripts/capture-deno-trace.mjs          # re-capture (needs Deno)
bun run scripts/capture-deno-trace.mjs --check  # compare, exit non-zero on drift
```

The `Deno drift` workflow runs `--check` against the latest 2.x, on demand —
worth a run when raising the Deno version or before a release. A failure there
is a decision to make, not a regression to fix: either follow the change, or
record why not.

## How it works

- `enforce: "pre"` — runs before esbuild/Vite's own transforms
- Registers a virtual module that re-exports runtime helpers from the detected runtime
- Only transforms `.tsx`/`.jsx` files (skips `node_modules`)
- Skips files without `<` (no JSX)
- Emits ``jsxTemplate`<div>${expr}</div>` `` with auto-imported runtime helpers

## Test

```sh
bun test
```

## License

MIT
