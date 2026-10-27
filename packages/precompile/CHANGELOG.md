# @vincle/precompile

## Unreleased

- Promote a declaration-level `import type { jsxAttr }` to a value binding without emitting a second local identifier, and keep other type imports and aliases intact.
- On Vite 8, detect the JSX runtime from the resolved `oxc` config only: follow an `esbuild.jsxImportSource` Vite converted when `esbuild.jsx` is `"automatic"`, and ignore `oxc: false`, `jsx: "preserve"`, a classic runtime and an empty source. Vite 5–7 keep the esbuild fallback when `oxc` is absent.
- Fail the build only when genuine host or component JSX reaches it with no detectable runtime; a `.tsx` with no JSX, such as a less-than comparison or a `"<"` string, no longer trips the check.
- Declare `engines.node` (`>=22.12.0`), the minimum Node that oxc-parser accepts on the Node 22 line, so a package manager can warn or refuse on an unsupported Node.
- Decode HTML entities in static attribute values, as the JSX compilers do: `title="Tom &amp; Jerry"` now renders `Tom &amp; Jerry`, identical to the runtime path, instead of `Tom &amp;amp; Jerry`.

## 0.9.0 — 2026-10-05

- Initial npm publication of the JSX precompile transform.
- Separate emission and runtime helpers; retain build-time sanitization and runtime escaping.
- Update `magic-string` to 1.4.3 and the OXC parser to 0.153.0. Keep Preact as a development dependency for runtime-compatibility tests.
