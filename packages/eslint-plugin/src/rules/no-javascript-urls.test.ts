import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noJavascriptUrls } from "./no-javascript-urls";

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
    '<a href="mailto:x@y.z">Mail</a>',
    // "javascript" not at the scheme position → safe
    '<a href="/path?x=javascript:foo">ok</a>',
    '<img src="https://cdn/x.png" />',
    // Dynamic value the rule can't judge statically — left to the runtime
    "<a href={userUrl}>x</a>",
    // Not a URL attribute
    '<div title="javascript:alert(1)">x</div>',
    '<input value="javascript:alert(1)" />',
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
    // Leading whitespace bypass — browsers strip it and still execute
    {
      code: '<a href=" javascript:alert(1)">x</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    // Tab inside the scheme
    {
      code: '<a href="java\tscript:alert(1)">x</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    // Expression-wrapped literal
    {
      code: '<a href={"javascript:alert(1)"}>x</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    // Template literal with no interpolation
    {
      code: "<a href={`javascript:alert(1)`}>x</a>",
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    // vbscript: too
    {
      code: '<a href="vbscript:msgbox(1)">x</a>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    // Other URL-bearing attributes
    {
      code: '<iframe src="javascript:alert(1)" />',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    {
      code: '<form action="javascript:alert(1)"></form>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    {
      code: '<button formaction="javascript:alert(1)">x</button>',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
    {
      code: '<use xlink:href="javascript:alert(1)" />',
      errors: [{ messageId: "noJavascriptUrl" }],
    },
  ],
});
