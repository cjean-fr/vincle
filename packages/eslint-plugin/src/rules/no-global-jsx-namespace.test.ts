import { noGlobalJsxNamespace } from "./no-global-jsx-namespace";
import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
  },
});

ruleTester.run("no-global-jsx-namespace", noGlobalJsxNamespace, {
  valid: [
    // `JSX` explicitly imported from @vincle/core → not the global one.
    'import { JSX } from "@vincle/core";\ntype A = JSX.Element;',
    'import type { JSX } from "@vincle/core";\ntype A = JSX.IntrinsicElements["div"];',
    // The recommended public annotation.
    'import type { VincleNode } from "@vincle/core";\ntype A = VincleNode;',
    // A local binding named JSX shadows the global.
    "declare namespace JSX {\n  type Element = unknown;\n}\ntype A = JSX.Element;",
    // Unrelated type references.
    "type A = string;",
    "type A = Array<number>;",
  ],
  invalid: [
    {
      code: "type A = JSX.Element;",
      output: 'import type { JSX } from "@vincle/core";\ntype A = JSX.Element;',
      errors: [
        {
          messageId: "preferImportedJsx",
          suggestions: [
            {
              messageId: "useVincleNode",
              output:
                'import type { VincleNode } from "@vincle/core";\ntype A = VincleNode;',
            },
          ],
        },
      ],
    },
    {
      // Non-Element member → import auto-fix, but no VincleNode suggestion.
      code: 'let x: JSX.IntrinsicElements["div"];',
      output:
        'import type { JSX } from "@vincle/core";\nlet x: JSX.IntrinsicElements["div"];',
      errors: [{ messageId: "preferImportedJsx" }],
    },
    {
      code: "function f(): JSX.Element {\n  return null as never;\n}",
      output:
        'import type { JSX } from "@vincle/core";\nfunction f(): JSX.Element {\n  return null as never;\n}',
      errors: [
        {
          messageId: "preferImportedJsx",
          suggestions: [
            {
              messageId: "useVincleNode",
              output:
                'import type { VincleNode } from "@vincle/core";\nfunction f(): VincleNode {\n  return null as never;\n}',
            },
          ],
        },
      ],
    },
  ],
});
