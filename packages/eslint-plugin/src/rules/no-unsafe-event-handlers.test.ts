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
  valid: [
    '<button class="btn">Click me</button>',
    '<div data-onclick="none"></div>',
    // Component props are not serialized — functions are legitimate callbacks.
    "<Foo onClick={() => {}} />",
    "<MyComponent onClick={handler} onMount={function () {}} />",
    '<Widget class="x" />',
  ],
  invalid: [
    // A function never works — @vincle/core has nothing to attach it to and
    // rendering throws. Distinct message from a string handler, which does work.
    {
      code: "<button onClick={() => {}}>Click me</button>",
      errors: [{ messageId: "functionAttribute" }],
    },
    {
      code: "<button onClick={function () {}}>Click me</button>",
      errors: [{ messageId: "functionAttribute" }],
    },
    // …and a function fails on *any* attribute of an HTML element, not just
    // event handlers — a render-time error in every case.
    {
      code: "<div class={() => {}}></div>",
      errors: [{ messageId: "functionAttribute" }],
    },
    {
      code: "<img alt={function () {}} />",
      errors: [{ messageId: "functionAttribute" }],
    },
    {
      code: '<input value={() => "x"} />',
      errors: [{ messageId: "functionAttribute" }],
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
