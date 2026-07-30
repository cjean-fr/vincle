import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noUnsafeEventHandlers } from "./no-unsafe-event-handlers";

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
  valid: ['<button class="btn">Click me</button>', '<div data-onclick="none"></div>'],
  invalid: [
    // A function never works — @vincle/core has nothing to attach it to and
    // rendering throws. Distinct message from a string handler, which does work.
    {
      code: "<button onClick={() => {}}>Click me</button>",
      errors: [{ messageId: "functionHandler" }],
    },
    {
      code: "<button onClick={function () {}}>Click me</button>",
      errors: [{ messageId: "functionHandler" }],
    },
    // Strings render fine — discouraged, not broken.
    {
      code: '<div onMouseOver="alert(1)"></div>',
      errors: [{ messageId: "inlineHandler" }],
    },
    {
      code: '<div onclick={"alert(1)"}></div>',
      errors: [{ messageId: "inlineHandler" }],
    },
    // Anything not statically a function expression gets the milder message.
    {
      code: "<div onClick={handler}></div>",
      errors: [{ messageId: "inlineHandler" }],
    },
  ],
});
