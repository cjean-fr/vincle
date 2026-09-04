// Mutation run scoped to the three differential fuzzers.
//
// `stryker.config.json` measures the whole suite. This one runs *only* the
// fuzzers, so a surviving mutant means one thing: the generated inputs never
// reach that branch, or reach it and both paths stay in agreement. That is the
// list of what the fuzzing does not detect — the input a generator has to grow
// to cover, or a branch that is no fuzzer's business.
//
// Scope is the render path the three fuzzers traverse. `context.ts`, `html.ts`
// and the namespace/dev-runtime files are out: no fuzzer touches them, and
// their mutants would all survive as known noise.
//
// No break threshold — this is a measurement, not a gate. The suite-wide gate
// stays in `stryker.config.json`.
import base from "./stryker.config.json" with { type: "json" };

export default {
  ...base,
  commandRunner: {
    command: [
      "bun test",
      "src/path-equivalence.test.ts",
      "src/precompile-equivalence.test.ts",
      "src/attr-equivalence.test.ts",
    ].join(" "),
  },
  mutate: [
    "src/attrs.ts",
    "src/escape.ts",
    "src/jsx-precompile-runtime.ts",
    "src/jsx-runtime.ts",
    "src/render.ts",
    "src/serialize.ts",
    "src/tag.ts",
    "src/types.ts",
  ],
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation-fuzz/index.html" },
  jsonReporter: { fileName: "reports/mutation-fuzz/mutation.json" },
  thresholds: { high: 100, low: 100, break: null },
};
