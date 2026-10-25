# @vincle/precompile

## Unreleased

- Declare `engines.node` (`>=22.0.0`), as the other packages do, so a package manager can warn or refuse on an unsupported Node.
- Decode HTML entities in static attribute values, as the JSX compilers do: `title="Tom &amp; Jerry"` now renders `Tom &amp; Jerry`, identical to the runtime path, instead of `Tom &amp;amp; Jerry`.

## 0.9.0 — 2026-10-05

- Initial npm publication of the JSX precompile transform.
- Separate emission and runtime helpers; retain build-time sanitization and runtime escaping.
- Update `magic-string` to 1.4.3 and the OXC parser to 0.153.0. Keep Preact as a development dependency for runtime-compatibility tests.
