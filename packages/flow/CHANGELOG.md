# Changelog

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
