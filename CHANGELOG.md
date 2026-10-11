# Vincle workspace

Package changes are recorded in each package's `CHANGELOG.md`.

## 2026-10-11

### Changed

- Use Bun 1.4.3 native type checking for workspace checks. Keep TypeScript 6 for published declaration compatibility checks and `tsc` for output generation.

### Added

- Add `check:packed` to the main check pipeline. It builds all seven distributable packages, extracts their Bun-generated tarballs into a temporary dependency tree, verifies export and executable paths, checks published declarations and JSX compilation, and exercises rendering and imports under Bun and Node.js when available. External dependencies use the workspace's installed versions.

### Fixed

- Resolve release workflow package names from their manifests when validating build commands, including the unscoped `create-vincle` package.
