import { noUnsafeEventHandlers } from "./no-unsafe-event-handlers";
import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

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

ruleTester.run("no-unsafe-event-handlers", noUnsafeEventHandlers, {
  valid: [
    '<button class="btn">Click me</button>',
    '<div data-onclick="none"></div>',
  ],
  invalid: [
    {
      code: "<button onClick={() => {}}>Click me</button>",
      errors: [{ messageId: "unsafeHandler" }],
    },
    {
      code: '<div onMouseOver="alert(1)"></div>',
      errors: [{ messageId: "unsafeHandler" }],
    },
  ],
});
