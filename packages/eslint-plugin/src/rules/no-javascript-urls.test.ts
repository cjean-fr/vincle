import { noJavascriptUrls } from "./no-javascript-urls";
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

ruleTester.run("no-javascript-urls", noJavascriptUrls, {
  valid: [
    '<a href="/home">Home</a>',
    '<a href="https://example.com">Example</a>',
  ],
  invalid: [
    {
      code: '<a href="javascript:alert(1)">Click me</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    {
      code: '<a href="JAVASCRIPT:void(0)">Click me</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
  ],
});
