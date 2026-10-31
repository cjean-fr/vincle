# @vincle/precompile

## 0.10.0 — 2026-10-31

- Lower components and non-template host elements to Deno-style direct `jsx` calls instead of leaving JSX for a later compiler. Preserve spread props, explicit `key` as a third argument, and Deno child grouping, with native Deno 2.9.8 call-oracle regressions. Keep Vincle's runtime host-prop policies and pass the explicit key there too.

- Promote a declaration-level `import type { jsxAttr }` to a value binding without emitting a second local identifier, and keep other type imports and aliases intact.
- On Vite 8, detect the JSX runtime from the resolved `oxc` config only: follow an `esbuild.jsxImportSource` Vite converted when `esbuild.jsx` is `"automatic"`, and ignore `oxc: false`, `jsx: "preserve"`, a classic runtime and an empty source. Vite 5–7 keep the esbuild fallback when `oxc` is absent.
- Fail the build only when genuine host or component JSX reaches it with no detectable runtime; a `.tsx` with no JSX, such as a less-than comparison or a `"<"` string, no longer trips the check.
- Declare `engines.node` (`>=22.12.0`), the minimum Node that oxc-parser accepts on the Node 22 line, so a package manager can warn or refuse on an unsupported Node.
- Decode HTML entities in static attribute values, as the JSX compilers do: `title="Tom &amp; Jerry"` now renders `Tom &amp; Jerry`, identical to the runtime path, instead of `Tom &amp;amp; Jerry`.
- Leave a file untouched when its `/** @jsxImportSource … */` pragma names a runtime other than the one configured for the build: a `@jsxImportSource preact` (or `@vincle/core/xml`) file is no longer precompiled in silence with Vincle's helpers and HTML rules. A file with no pragma is still transformed, as before.
- When a file's pragma names a compatible runtime (one that exports `jsxTemplate`, and optionally declares the `"vincle"` precompile dialect for corrected, sanitized output), precompile it with that runtime instead of delegating to the bundler. An incompatible or unloadable runtime still delegates.

## 0.9.0 — 2026-10-05

- Initial npm publication of the JSX precompile transform.
- Separate emission and runtime helpers; retain build-time sanitization and runtime escaping.
- Update `magic-string` to 1.4.3 and the OXC parser to 0.153.0. Keep Preact as a development dependency for runtime-compatibility tests.
