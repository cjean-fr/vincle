# @vincle/precompile

Precompiles lowercase (native HTML) JSX elements into tagged template literals.
Instead of emitting `jsx()` calls that create intermediate objects at every
render, it rewrites JSX into `jsxTemplate` tagged templates: fewer allocations,
less GC pressure, faster rendering.

```tsx
// Source
<div class={cls}>{text}</div>;

// Before (runtime): VNode tree, created on every render
jsx("div", { class: cls }, text);

// After (precompile): direct string assembly
jsxTemplate`<div ${jsxAttr("class", cls)}>${jsxEscape(text)}</div>`;
```

Three entry points, one transform:

| import                    | what it is                                     |
| ------------------------- | ---------------------------------------------- |
| `@vincle/precompile`      | the transform itself, for any pipeline         |
| `@vincle/precompile/vite` | Vite plugin                                    |
| `@vincle/precompile/bun`  | Bun plugin, for a server with no Vite in front |

It pays per render repeated, which is the SSR shape: a statically generated
page is rendered once and has nothing to amortise.

## What it buys

On a 100-row list mixing literal markup (`<li class="item">`) and holes, the
precompiled path renders about **1.5× faster** than `jsx()`. It saves what it
can inline: a page of mostly literal markup gains more than a table where every
value comes from data.

## Compatible runtimes

| Runtime | `jsxImportSource` | Compatible              |
| ------- | ----------------- | ----------------------- |
| Vincle  | `@vincle/core`    | ✅ (vincle dialect)     |
| Preact  | `preact`          | ✅                      |
| Hono    | `hono/jsx`        | ✅                      |
| React   | `react`           | ❌ (throws build error) |

React does not export the `jsxTemplate` helper that the precompile transform
relies on.

### The vincle dialect

When targeting `@vincle/core`, the transform activates the **vincle dialect**:
static attribute values run through `jsxAttr` at build time, so URL schemes,
`style` declarations, and attribute names are sanitized the same way as dynamic
values — but at build time, with zero runtime cost. The generated template is
the same bytes the runtime would emit, except unsafe URLs become `#blocked`
in the bundle itself.

For any other runtime, the output reproduces Deno's `jsx: "precompile"` byte
for byte, and static attributes are inlined unfiltered.

## Install

```sh
npm install @vincle/precompile -D
```

`vite` >= 5 is an optional peer dependency, needed only for the `/vite` entry
point.

## Usage

### Vite

Just add the plugin: no adapter file needed.

```ts
// vite.config.ts
import precompile from "@vincle/precompile/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [precompile()],
});
```

The plugin automatically detects the runtime from your `jsxImportSource` and
wires up the helpers through a virtual module
(`virtual:vincle-precompile-runtime`).

### Bun

A server that imports its own modules never reaches a Vite plugin, whatever the
config says. On Bun, load the transform from a preload script:

```ts
// preload.ts
import { plugin } from "bun";
import precompile from "@vincle/precompile/bun";

plugin(precompile());
```

```sh
bun --preload ./preload.ts server.ts
```

There is no virtual module here, so the helpers come from `runtimeSource`
(`@vincle/core/jsx-runtime` unless you set another), and Bun has no end-of-build
hook, so nothing warns when the plugin matches no file: a transformed module
imports `jsxTemplate`, which is the direct check.

### Any other pipeline

Call the transform directly:

```ts
import precompileTransform from "@vincle/precompile";

const result = precompileTransform(
  code, // source text
  "/src/App.tsx", // file id: its extension selects tsx vs jsx
  { runtimeSource: "preact/jsx-runtime" }, // optional PluginConfig
  renderAttr, // optional: build-time attribute serializer
  renderEscape, // optional: build-time content escaper
);
// → { code: string, map: SourceMap } | null (null when nothing to rewrite)

if (result && result.code !== code) {
  // feed result.code to your pipeline, keep result.map
}
```

`renderAttr` / `renderEscape` are the target runtime's own `jsxAttr` /
`jsxEscape`. Pass both to get the corrected, sanitized output (vincle dialect);
pass neither for the reference output (Deno byte-for-byte), where static
attributes are trusted and inlined without filtering.

## API

### `PluginConfig`

```ts
interface PluginConfig {
  runtimeSource?: string; // default: virtual:vincle-precompile-runtime → auto-detected
}
```

`runtimeSource` is only needed when using a runtime other than the detected one.
A module wrapping `@vincle/core` keeps its dialect only by re-exporting it whole:

```ts
// my-vincle-runtime.ts
export * from "@vincle/core/jsx-precompile-runtime";
```

Naming only the three helpers (`jsxTemplate`, `jsxAttr`, `jsxEscape`) makes it
another runtime: it would not declare the `"vincle"` precompile dialect, and the
transform would reproduce Deno's output with unfiltered static attributes.

A runtime declaring the `"vincle"` precompile dialect must export both `jsxAttr`
and `jsxEscape`, or the build fails.

### Default export

```ts
function vitePrecompile(config?: PluginConfig): Plugin;
```

Returns a Vite plugin with `enforce: "pre"`: runs before esbuild/Vite's own
transforms.

```ts
function precompileTransform(
  code: string,
  id: string,
  config?: PluginConfig,
  renderAttr?: (key: string, value: unknown) => string,
  renderEscape?: (text: string) => string,
): { code: string; map: SourceMap } | null;
```

The transform is pure: no side effects, deterministic output for the same input.

### What it outputs

| Feature                 | Vite plugin                    | Bun plugin                 | Direct call       |
| ----------------------- | ------------------------------ | -------------------------- | ----------------- |
| Helper injection        | ✅ (virtual module)            | ❌ (needs `runtimeSource`) | Caller provides   |
| Build-time sanitization | ✅ (vincle dialect)            | ✅ (vincle dialect)        | With `renderAttr` |
| End-of-build warning    | ✅ ("nothing was precompiled") | ❌ (no hook)               | ❌                |

## Known it runs

A precompiled page and a runtime-rendered one are the same document, so a plugin
that never sees your JSX is silent: only the speed differs. The Vite plugin
warns at the end of a build it did nothing in:

```
[vincle/precompile] nothing was precompiled in this build: no
.jsx/.tsx module passed through it at all (11 module(s) seen). …
```

If that build does not render your JSX, the plugin does not belong in it.
Otherwise your modules are not reaching Vite. The Bun plugin has no end-of-build
hook, so it does not warn. The check that works everywhere: a transformed module
imports `jsxTemplate`.

## Build-time sanitization

Enabled by default with `@vincle/core`. Each static attribute value goes through
the runtime's own `jsxAttr` at build time, and the result is inlined into the
template, at zero runtime cost.

```tsx
// A static attribute that looks harmless
<a href="javascript:alert(1)">click</a>

// Targeting @vincle/core → blocked at build time
//   jsxTemplate`<a href="#blocked">click</a>`

// Targeting another runtime → inlined verbatim in the bundle
//   jsxTemplate`<a href="javascript:alert(1)">click</a>`
```

A static value gets the filtering a dynamic one gets: URL schemes, `style`
declarations, attribute names.

## Deno drift

For a runtime that does not declare the `"vincle"` precompile dialect, the
transform reproduces Deno's own `jsx: "precompile"` output, and
`test-fixtures/deno-precompile-trace.json` is what Deno emitted when captured,
every helper call in order, with the names chosen. CI compares against that file
on every PR, so the project needs no Deno installed.

```bash
bun run scripts/capture-deno-trace.mjs          # re-capture (needs Deno)
bun run scripts/capture-deno-trace.mjs --check  # compare, exit non-zero on drift
```

The `Deno drift` workflow on GitHub runs `--check` against the latest 2.x, on
demand. A failure there is a decision to make, not a regression to fix: either
follow the change, or record why not.

## How it works

- `enforce: "pre"`: runs before esbuild/Vite's own transforms
- Registers a virtual module that re-exports runtime helpers from the detected runtime
- Only transforms `.tsx`/`.jsx` files (skips `node_modules`)
- Skips files without `<` (no JSX to transform)
- Emits `jsxTemplate`<div>${expr}</div>`` with auto-imported runtime helpers
- Only transforms **lowercase** tags (`<div>`, `<span>`): component JSX like
  `<MyComp />` passes through unchanged, because the transform operates on the
  element level — components are function calls, not elements.

## Test

```sh
bun test
```

## License

MIT
