# @vincle/flow

## Unreleased

### Fixed

- Keep `<Style>` / `<Script>` deduplication on document order under concurrent siblings: the first occurrence of a `name` *in the document* emits, even when a later occurrence finishes rendering first. Claims now register a mark and the winner is decided after the render, so only the winning occurrence's content factory is evaluated, with the Provider and `Scope` context of its own position.

### Added

- Add the `update` merge type: it replaces the target's content and keeps the element itself. Turbo maps it to its `update` stream action, HTMX to the `innerHTML` swap, and the Native polyfill replaces the target's children with `replaceChildren` (falling back to the placeholder's range when the target has no element). `NativeAdapter` now declares it, so `merge="update"` is accepted there too.

## 0.11.0 — 2026-10-11

### Added

- Add optional `maxConcurrency` to streaming and static rendering options to limit active deferred fragments, including live streams. Concurrency remains unlimited by default; lazy factories start only when a slot is available, and queued factories do not start after request cancellation.
- Add `onObserve` and the exported `FlowObservation` type for fragment lifecycle diagnostics: start, completion, error, timeout and cancellation, with the fragment ID, elapsed milliseconds and optional error. Observer exceptions do not affect rendering, and `onError` continues to control fallback rendering.

### Changed

- Allow `renderToStatic` to accept the shared Flow options, including cancellation, default timeouts, error fallbacks, concurrency limits and diagnostics, and forward them to fragment emission.

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
