import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noAmbiguousHtmlChildren } from "./no-ambiguous-html-children";

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

ruleTester.run("no-ambiguous-html-children", noAmbiguousHtmlChildren, {
  valid: [
    // One source of content: either one alone is an ordinary component call.
    "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />",
    "<Comp>content</Comp>",
    // Layout whitespace and comments are not content.
    "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>\n</Comp>",
    "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>{/* note */}</Comp>",
    // An HTML tag is the runtime's contract: it throws at construction, so
    // this rule stays silent rather than holding a second copy of the rule.
    "<div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>y</div>",
    // A spread may carry the prop: the call site cannot be judged.
    "<Comp {...props}>content</Comp>",
  ],
  invalid: [
    {
      code: "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>hello</Comp>",
      errors: [{ messageId: "noDsihChildren" }],
    },
    {
      code: "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}><Child /></Comp>",
      errors: [{ messageId: "noDsihChildren" }],
    },
    {
      code: "<Comp dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>{value}</Comp>",
      errors: [{ messageId: "noDsihChildren" }],
    },
    {
      code: "<Foo.Bar dangerouslySetInnerHTML={{ __html: '<b>x</b>' }}>x</Foo.Bar>",
      errors: [{ messageId: "noDsihChildren" }],
    },
  ],
});
