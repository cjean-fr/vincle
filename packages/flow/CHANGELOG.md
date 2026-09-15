# Changelog

## 1.0.0 — 2026-09-16

First public release.

### Breaking changes (since 0.9.0)

- **`<Template>` renamed to `<Defer>`.** The deferred-content primitive is now
  `<Defer target="…">`, with `<Defer.Group>` for grouped items.
  `import { Defer } from "@vincle/flow"`.
- **Peer dependency** on `@vincle/core` bumped to `^1.0.0`.

### Added

- **`renderFragment`** — regenerate one fragment without rebuilding the site.
- **Morph merge** — deferred content merges into the shell by morph.
- **Fail-fast setup** — a misconfigured option or adapter throws at setup,
  not mid-stream.
- **Machine-readable error code** on every flow error.

## 0.9.0 — 2026-06-29

### Public API simplification

- **Reduced main export surface.** `@vincle/flow` exports the primitives —
  `Slot`, `Template`, `Include`, `renderToStream`, `renderToFlowEvents`,
  `renderToStatic` — and the types they need. Le reste vit sous des
  sous-chemins :
  - `@vincle/flow/adapters` — `NativeAdapter`, `TurboAdapter`, `HtmxAdapter`,
    `WebPlatformAdapter`, `EsiAdapter`, `createAdapter`, `NATIVE_POLYFILL`, etc.
  - `@vincle/flow/components` — `Style`, `Script`
  - `@vincle/flow/http` — `serve`, `negotiateHtmx`
  - `@vincle/flow/utils` — `composeShell`, `injectIntoHead`
  - `@vincle/flow/context` — `Flow`, `FlowContext`

### Removed

- **Removed duplicate `Style`/`Script` components.** Two implementations existed:
  `components/Style.tsx` + `components/Script.tsx` (broken — imported nonexistent
  symbols) and `components/assets.tsx` (working, context-based). Kept the latter.
  Use `import { Style, Script } from "@vincle/flow/components"`.

### Fixed

- **`injectIntoHead`** now handles case-insensitive `</head>`, whitespace
  variants, and wraps in `<head>` when no `</head>` is present instead of
  blindly prepending.
