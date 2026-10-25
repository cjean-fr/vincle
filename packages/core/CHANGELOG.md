# @vincle/core

## Unreleased

### Fixed

- Throw `ERR_VINCLE_FUNCTION_AS_TEXT` when a function is used as a child, in an element, an array, `<script>` or `<style>`, or a template hole. It was written into the HTML as its source code, which could expose server-side code. A component interpolated as `{Comp}` instead of `<Comp />` now fails the same way a VNode does.

### Changed

- Mark the `typescript` peer dependency as optional, so installing Core no longer downloads the TypeScript compiler and its platform package. The peer range still documents the supported compiler versions for TypeScript consumers, who provide their own.

## 0.9.1 — 2026-10-05

### Changed

- Escape primitive array entries directly, avoiding intermediate `RawString` allocations.
- Decouple the renderer from context providers so renders without context do not pull in AsyncLocalStorage.
- Add neutral `TemplateHTMLAttributes` and VNode extension interfaces for integration-owned JSX types; Core remains independent of Flow.
- Refresh the README with concise usage and Bun, pnpm, and npm installation commands.

### Fixed

- Serialize `buffer` and `sanitize` as boolean attributes.

Changes since the npm release 0.9.0 (commit `02b6840`).
