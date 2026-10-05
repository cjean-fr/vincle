# @vincle/core

## 0.9.1 — 2026-10-05

### Changed

- Escape primitive array entries directly, avoiding intermediate `RawString` allocations.
- Decouple the renderer from context providers so renders without context do not pull in AsyncLocalStorage.
- Add neutral `TemplateHTMLAttributes` and VNode extension interfaces for integration-owned JSX types; Core remains independent of Flow.
- Refresh the README with concise usage and Bun, pnpm, and npm installation commands.

### Fixed

- Serialize `buffer` and `sanitize` as boolean attributes.

Changes since the npm release 0.9.0 (commit `02b6840`).
