import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noRefs } from "./no-refs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-refs", noRefs, {
  valid: ['<input id="field" />', '<div data-ref="not-a-ref" />'],
  invalid: [
    {
      code: "<input ref={inputRef} />",
      errors: [{ messageId: "noRef" }],
    },
    {
      code: '<div ref="legacyStringRef">content</div>',
      errors: [{ messageId: "noRef" }],
    },
  ],
});
