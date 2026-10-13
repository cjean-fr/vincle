# Changelog

## Unreleased

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
