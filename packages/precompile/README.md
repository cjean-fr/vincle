# @vincle/precompile

Precompiles lowercase (native HTML) JSX elements into Deno-style `jsxTemplate` tagged template literals.

Three entry points, one transform:

| import                    | what it is                                     |
| ------------------------- | ---------------------------------------------- |
| `@vincle/precompile`      | the transform itself, for any pipeline         |
| `@vincle/precompile/vite` | Vite plugin                                    |
| `@vincle/precompile/bun`  | Bun plugin, for a server with no Vite in front |

It pays per render repeated, which is the SSR shape: a statically generated page is rendered once and has nothing to amortise.

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
npm install @vincle/precompile -D
```

`vite` >= 5 is an optional peer dependency, needed only for the `/vite` entry point.

## Usage

Just add the plugin — no adapter file needed.

```ts
// vite.config.ts
import precompile from "@vincle/precompile/vite";
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

## Bun

A server that imports its own modules never reaches a Vite plugin, whatever the config says. On Bun, load the transform from a preload script:

```ts
// preload.ts
import { plugin } from "bun";
import precompile from "@vincle/precompile/bun";

plugin(precompile());
```

```sh
bun --preload ./preload.ts server.ts
```

There is no virtual module here, so the helpers come from `runtimeSource` (`@vincle/core/jsx-runtime` unless you set another), and Bun has no end-of-build hook, so nothing warns when the plugin matches no file — a transformed module imports `jsxTemplate`, which is the direct check.

## The transform alone

Exposed for any other pipeline — it is exactly what both adapters call:

```ts
import precompileTransform from "@vincle/precompile";

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
