# Changelog

## Unreleased

- Add `base`, the path prefix the site is served under, next to `site`, now the public origin. It sets the sitemap URLs and Vite's `base` in builds and in dev; a different Vite `base` is a configuration error. A path in `site` alone is still accepted.

## 0.3.0

- Keep the CLI launcher in the package before compilation so clean workspace installs create the `ssg` executable.

- Consolidate layout rendering and CLI configuration loading; remove the generated-JavaScript recognizer in favor of direct static HTML or normal MDX module evaluation.

- Use Sätteri as the only Markdown/MDX compiler, including the default handlers; preserve module metadata, additional outputs and custom JSX runtimes. Remove `@mdx-js/mdx`.

- Detect standalone `main.css` alongside the conventional client script, removing the need for an asset config in sites using these conventions.

- Add `@vincle/ssg/mdx` with configurable lazy Sätteri compilation, bounded caching, static HTML and Markdown alternates; migrate documentation to this shared pipeline.

- Prefer src/pages for routes and src/_client for client assets, retaining flat src compatibility.

- Exclude private/generated directories from dev watching and recover from ENOSPC using polling.

- Add final-page publication records for search plugins and configurable page discovery.
- Generate multilingual sitemap alternates from locale/translation metadata.
- Enable the installed Tailwind Vite plugin automatically and default dev to loopback/PORT/4321.

- Add the `ssg dev` / `ssg build` CLI with typed `ssg.config` discovery and `defineConfig`.
- Keep development output in the OS temporary directory and coordinate Vite/SSG shutdown.
- Add configurable MIME types, Markdown/JPEG XL defaults, development redirects and error pages/statuses.

## 0.2.0

- Publish development changes incrementally, preserving unchanged outputs and removing obsolete files while retaining complete hook inspection and collision checks.

- Consolidate content loading under the modern `PageHandler` contract and migrate documentation handlers/rendering.
- Add metadata, render, transform and pre-publication plugin phases, including staged file inspection and derived outputs.
- Share Vite production configuration, aliases, build plugins and server module graphs across pages, layouts, MDX and assets.

- Reject missing/non-directory source roots before preparing assets or publishing outputs.
- Standardize SSG errors as human-readable, actionable and JSON-serializable diagnostics with stable reasons and original causes.
- Use Vite's `rolldownOptions` and honor explicit top-level asset inputs.

- Rename the package from `@vincle/site` to `@vincle/ssg`.
- Add convention-based source routes, default JS/TS/JSX/TSX/Markdown/MDX handlers and multiple text/binary outputs.
- Share metadata between handlers, components, layouts and plugins, with per-source/output sitemap controls.
- Add inherited layouts with page overrides and configurable JSX runtimes.
- Prepare Vite assets and manifests with page outputs, detecting project configuration or private client entries.
- Retain the lower-level writer and generic discovery for existing consumer pipelines.

## 0.1.0

- Generate complete static sites from text and binary outputs, including async producers.
- Copy public resources, preserve external assets, and remove obsolete generated files.
- Reject invalid paths, symbolic copies, and file collisions.
- Prepare outputs before publication so production failures retain the previous site.

- Split built-in sitemaps at 50,000 URLs or 52,428,800 UTF-8 bytes and generate a bounded sitemap index when needed.
- Add `dev()` with Vite middleware, file watching, browser reload and error overlays, using isolated generated output.

- Release deleted development pages from MDX, Vite resolution and runner caches; clear owned caches on close and coalesce concurrent rebuild requests.

- Cache dev page rendering with import/layout/file dependency invalidation, `context.watch`, per-page opt-out, conservative extension policies and forced rebuilds. Publication and sitemap retain the complete output set.
