import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "index.ts",
    html: "src/html.ts",
    "jsx-runtime": "src/jsx-runtime.ts",
    "jsx-dev-runtime": "src/jsx-dev-runtime.ts",
    "jsx-precompile-runtime": "src/jsx-precompile-runtime.ts",
  },
  format: "esm",
  clean: true,
  // Comments out, code as written. The prose in these modules is why they are
  // worth reading and it was 8.6 kB of the 17.2 kB shipped gzip — while `files`
  // publishes `src`, the `bun` condition resolves to it, and the `.d.mts` still
  // carries every JSDoc to the editor, so nothing is actually lost.
  //
  // Neither half below removes dead code: rolldown already tree-shakes it (the
  // test-only `@internal` helpers are not in `dist`), and what `compress` finds
  // is expression rewriting, not unreachable code.
  //
  // The two halves left off, with what they cost, because "minify: true" is the
  // obvious thing to write here:
  //
  // - `compress`: 91 bytes gzip. It rewrites semantics — dead-code elimination,
  //   inlining, expression simplification — and that is a poor trade for 1% in a
  //   package whose argument is that its output is predictable.
  // - `mangle`: 1.5 kB gzip. It renames the functions that name themselves in a
  //   stack trace. This is server code: those bytes are not on any page's
  //   critical path, and a legible trace in a bug report is worth more.
  minify: { compress: false, mangle: false },
});
