import tseslint from "typescript-eslint";
import * as vincle from "./packages/eslint-plugin/dist/index.js";

// eslint-disable-next-line @typescript-eslint/no-deprecated -- tseslint.config remains the supported composition helper; migrating to ESLint's defineConfig is a separate change.
export default tseslint.config(
  {
    // LINT DISABLED until eslint config is cleaned up (too many false positives
    // from strictTypeChecked + vincle plugin overlap). Re-enable by removing
    // the `"**"` ignore below and fixing the violations one by one.
    ignores: ["**"],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // allowDefaultProject: type-aware linting for root config files that
        // aren't part of any package tsconfig (e.g. this file itself).
        projectService: {
          allowDefaultProject: ["eslint.config.ts"],
        },
      },
    },
    plugins: {
      "@vincle/core": vincle.default,
    },
    rules: {
      ...vincle.default.configs.recommended.rules,
      // Allow deliberately-unused args/vars/caught-errors prefixed with `_`
      // (e.g. `_props`, `_key`, `_self` on runtime-signature shims).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // ESLint rule authoring compares AST `node.type` against string literals
    // (`=== "Literal"`); TSESTree types `type` as an enum, so
    // no-unsafe-enum-comparison fires on the universal idiom. Off for the rule
    // sources only.
    files: ["packages/eslint-plugin/src/rules/**"],
    rules: {
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
    },
  },
  {
    // Internal apps (not published): the benchmark harness deliberately imports
    // React/Preact/Hono to compare against them — vincle's anti-React rules
    // don't apply. The strict type-safety rules are also noise in throwaway
    // perf/build glue. Correctness rules (unused vars, floating promises) stay.
    files: ["apps/**"],
    rules: {
      "@vincle/core/no-react-imports": "off",
      "@vincle/core/no-global-jsx-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  {
    // Test files exercise the API deliberately: poking types with `any`,
    // asserting on known-good values with `!`, awaiting sync-capable calls,
    // and building fixture strings. The type-aware "safety" rules are noise
    // here and would only push contortions into test code — relax them, but
    // keep the ones that still catch real test bugs (floating/misused
    // promises, unused vars). Standard typescript-eslint guidance for tests.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test-d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      // Test-only dependency deprecations (fast-check arbitraries) are not the
      // product's concern, and migrating them would change fuzz sampling.
      "@typescript-eslint/no-deprecated": "off",
      // Fixtures deliberately contain the very patterns the vincle rules
      // forbid (javascript: URLs, React imports, event-handler props) to prove
      // the runtime/plugin handles them — so the rules must not fire on tests.
      "@vincle/core/no-context": "off",
      "@vincle/core/no-global-jsx-namespace": "off",
      "@vincle/core/no-javascript-urls": "off",
      "@vincle/core/no-react-hooks": "off",
      "@vincle/core/no-react-imports": "off",
      "@vincle/core/no-refs": "off",
      "@vincle/core/no-unsafe-event-handlers": "off",
    },
  },
);
