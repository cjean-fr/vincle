# @vincle/flow

## 0.10.1 — 2026-10-08

### Fixed

- Stop waiting for a pending shell render when the request is cancelled, allowing the stream to close and fragment storage to be cleared.
- Give error fallbacks a fresh render deadline using the fragment timeout or default timeout, and interrupt them on request cancellation. Preserve the original content error if fallback rendering fails or times out, without invoking the error handler again.

## 0.10.0 — 2026-10-05

### Breaking changes

- Remove `<Include>` and its error codes. Static `<Defer>` already emits a placeholder using `generatePath(id)`. Use `<Slot>` with `<Defer>` for named insertion points; arbitrary external includes must be handled by the application.

### Changed

- Own experimental Fragment Include template attributes and Turbo element types through module augmentation of Core's neutral interfaces. Make these augmentations reachable from published declarations and every public JSX entry point.
- Drain deferred fragments through a store cursor instead of maintaining a separate processed set.
- Refresh the README with concise usage and Bun, pnpm, and npm installation commands.

### Fixed

- Combine the HTTP request's abort signal with the caller's signal in `serve()`, cancelling rendering when the client disconnects.
- Stop waiting for user work that ignores cancellation; call `return()` on unfinished iterators without blocking cancellation.
- Continue discovering nested `<Defer>` nodes inside retained fallbacks.
- Match a placeholder's closing `<?end>` among its siblings, preserving surrounding content and nested marker ranges.
- Keep unmatched patch templates in the DOM until they can be applied.
- Protect polyfill-owned patch templates from partially implemented browser-native patching and detect active fragment includes without treating comments, raw text, or inert templates as active content.

Changes since the npm release 0.9.0 (commit `02b6840`).
