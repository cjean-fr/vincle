# create-vincle

## 0.10.1 — 2026-10-31

### Changed

- Generate projects using `@vincle/core` `^0.10.0` instead of `^0.9.1`.

### Fixed

- Print the package version with `--version`: it printed 0.9.0 while the package is 0.10.0. A test now compares it with `package.json`.

## 0.10.0 — 2026-10-11

### Added

- Support partial search responses in the Bun, Node.js and Deno templates through `X-Vincle-Fragment: results`. HTML responses include `Vary: X-Vincle-Fragment` so caches distinguish full pages from partial results.
- Limit search queries to 100 characters in the form and return HTTP 400 for longer queries on the server.
- Wrap search results in a named `#results` region with `aria-live="polite"` for browser updates.
- Add `create-vincle` to the manual publication workflow and document first-publication usage and partial requests.

### Changed

- Use native `bun check` in generated Bun projects. Node.js projects retain `tsc`; Deno projects retain `deno check`. Bun projects require Bun 1.4.3 or later.

- Generate projects using `@vincle/core` version `^0.9.1` instead of `^0.9.0`.

### Fixed

- Point the starter's Flow guide link to the streaming documentation.
