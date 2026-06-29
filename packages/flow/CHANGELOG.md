# Changelog

## 0.9.0 — 2026-06-29

### Public API simplification

- **Reduced main export surface.** `@vincle/flow` now exports only the core primitives:
  `Slot`, `Fill`, `Defer`, `ClientFetch`, `renderStream`, `renderToStatic`.
  Everything else — adapters, components, HTTP helpers, utils, types — lives
  under deep import paths:
  - `@vincle/flow/adapters` — `NativeAdapter`, `TurboAdapter`, `HtmxAdapter`,
    `WebPlatformAdapter`, `EsiAdapter`, `createAdapter`, `NATIVE_POLYFILL`, etc.
  - `@vincle/flow/components` — `Style`, `Script`
  - `@vincle/flow/http` — `serve`, `negotiateHtmx`
  - `@vincle/flow/utils` — `composeShell`, `injectIntoHead`
  - `@vincle/flow/types` — `MergeType`, `FlowEvent`, `StreamingAdapter`, etc.
  - `@vincle/flow/context` — `FlowContext`
  - `@vincle/flow/assets` — `resolveAssets`, `createAssetState`

### Removed

- **Removed duplicate `Style`/`Script` components.** Two implementations existed:
  `components/Style.tsx` + `components/Script.tsx` (broken — imported nonexistent
  symbols) and `components/assets.tsx` (working, context-based). Kept the latter.
  Use `import { Style, Script } from "@vincle/flow/components"`.

### Fixed

- **`injectIntoHead`** now handles case-insensitive `</head>`, whitespace
  variants, and wraps in `<head>` when no `</head>` is present instead of
  blindly prepending.
