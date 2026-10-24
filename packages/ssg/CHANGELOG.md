# Changelog

## Unreleased

- Depend on `@vincle/core` and `@vincle/vite-plugin` with caret ranges (`^0.9.1` and `^0.9.0` in the packed manifest) instead of exact versions, so a project that updates Core receives one copy shared with SSG, and a Core fix reaches SSG users without a new SSG release.
- Declare `engines.node` (`>=22.12.0`), the minimum Node that Vite 8 and oxc-parser accept on the Node 22 line, so a package manager can warn or refuse on an unsupported Node.
- Add `ssg generate`, the command that writes the site. `ssg build` still works as a deprecated alias and prints a warning; it will be removed in a later release.
- **Breaking**: remove build timings: the `timings` option, `ssg build --timings`, the `timings` field of the `build()` result and the `BuildTimings` type. The build summary line stays.
- Answer a malformed percent-encoded path in `ssg dev` with 400 instead of a 500 and a stack trace.
- **Breaking**: a `notFound` function now receives the percent-decoded path, the same one pages are resolved with, instead of the raw request path. `/caf%C3%A9` reaches it as `/café`.

## 0.4.0

- Add `base`, the path prefix the site is served under, next to `site`, now the public origin. It sets the sitemap URLs and Vite's `base` in builds and in dev; a different Vite `base` is a configuration error. A path in `site` alone is still accepted.
- Accept several asset integrations in `assets`, prepared, copied and released in declaration order, the first declared wrapping the renderer innermost; an explicit array (`[]` included) disables conventional detection. **Breaking**: `assets` is no longer a single integration, and `DevOptions` no longer omits it, so `ssg dev` prepares the declared integrations instead of Vite's alone. A single integration stays valid.
- Add an optional `dev()` pendant, prepared once per session and reused across rebuilds, and `watch`, whose files rebuild the site; integrations without `dev()` run `prepare` on every rebuild. **Breaking**: an integration that only implemented `prepare` and relied on the development server's own Vite preparation now runs on every rebuild.
- **Breaking**: resolve `AssetBuild.directory` from the project root, so an integration may return a relative preparation directory; a relative directory that used to resolve against the working directory now resolves against `root`.
- Add `@vincle/ssg/image`: `images({ converter, descriptors })` validates its descriptors when called, then generates every declared width and format through a project-provided converter, memoizing decoding by source state and encoding per variant, and watching the masters. `imageUrl()` is the single source of the public variant path.
- Add `<Picture>`, which renders a declared descriptor as one `<source>` per format except the last, plus an `<img>` fallback from the last format, prefixes the configured `base` once, and fails the build with `ERR_VINCLE_IMAGE_UNDECLARED` or `ERR_VINCLE_IMAGE_INVALID` instead of publishing a 404. `setImages()` installs the registry outside a build.

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
