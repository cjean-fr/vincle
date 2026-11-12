import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noForeignRawtext } from "./no-foreign-rawtext";

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

ruleTester.run("no-foreign-rawtext", noForeignRawtext, {
  valid: [
    // HTML context: rawtext rule applies, nothing to say
    '<div><script>{"if (a<b) {}"}</script></div>',
    '<script src="/app.js" />',
    '<style>{"div > p { color: red }"}</style>',
    // Integration points switch back to HTML
    '<svg><foreignObject><script>{"if (a<b) {}"}</script></foreignObject></svg>',
    '<svg><desc><style>{"p > a { color: red }"}</style></desc></svg>',
    '<svg><g><title><script>{"x<y"}</script></title></g></svg>',
    '<math><mi><script>{"x<y"}</script></mi></math>',
    // annotation-xml with an HTML encoding is an HTML integration point
    '<math><annotation-xml encoding="text/html"><script>{"x<y"}</script></annotation-xml></math>',
    '<math><annotation-xml encoding="application/xhtml+xml"><style>{"a>b{}"}</style></annotation-xml></math>',
    // A component is not an intrinsic element
    '<svg><Script>{"x<y"}</Script></svg>',
    // Foreign without rawtext inside
    '<svg><rect x="1" /></svg>',
    // The documented recipe is the correct usage, never flagged
    `import { raw } from "@vincle/core";
     import { escapeContent } from "@vincle/core/html";
     const p = (s: string) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
    `import { raw } from "@vincle/core";
     import { escapeContent } from "@vincle/core/html";
     const p = (s: string) => <math><style>{raw(escapeContent(s))}</style></math>;`,
    // Aliased imports are recognized
    `import { raw as trusted } from "@vincle/core";
     import { escapeContent as esc } from "@vincle/core/html";
     const p = (s: string) => <svg><script>{trusted(esc(s))}</script></svg>;`,
    // Namespace imports are recognized
    `import * as vincle from "@vincle/core";
     import * as html from "@vincle/core/html";
     const p = (s: string) => <svg><script>{vincle.raw(html.escapeContent(s))}</script></svg>;`,
    // Several recipe calls concatenate safely
    `import { raw } from "@vincle/core";
     import { escapeContent } from "@vincle/core/html";
     const p = (a: string, b: string) => <svg><script>{raw(escapeContent(a))}{raw(escapeContent(b))}</script></svg>;`,
    // A shadowing binding in a sibling scope does not taint the recipe
    `import { raw } from "@vincle/core";
     import { escapeContent } from "@vincle/core/html";
     const a = (raw: unknown) => raw;
     const p = (s: string) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
  ],
  invalid: [
    {
      code: '<svg><script>{"if (a<b) {}"}</script></svg>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      code: '<svg><g><style>{"rect > g { fill: red }"}</style></g></svg>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "style", root: "svg" } }],
    },
    {
      code: '<math><script>{"x<y"}</script></math>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "math" } }],
    },
    {
      // Back to HTML and into a nested SVG again
      code: '<svg><foreignObject><div><svg><script>{"x<y"}</script></svg></div></foreignObject></svg>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A fragment is transparent to the context
      code: '<svg><><script>{"x<y"}</script></></svg>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // annotation-xml without an HTML encoding stays foreign content
      code: '<math><annotation-xml><script>{"x<y"}</script></annotation-xml></math>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "math" } }],
    },
    {
      code: '<math><annotation-xml encoding="application/svg+xml"><script>{"x<y"}</script></annotation-xml></math>',
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "math" } }],
    },
    {
      // raw() alone is not the recipe: the source is not pre-escaped
      code: `import { raw } from "@vincle/core";
             const p = (s: string) => <svg><script>{raw(s)}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // escapeContent without raw(): the escaped text is escaped again at render
      code: `import { escapeContent } from "@vincle/core/html";
             const p = (s: string) => <svg><script>{escapeContent(s)}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // Same-shaped calls not bound to the Vincle imports are not the recipe
      code: `declare function raw(s: unknown): string;
             declare function escapeContent(s: string): string;
             const p = (s: string) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A parameter shadowing the raw import is not the helper
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (raw: unknown) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A parameter shadowing the escapeContent import is not the helper
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (escapeContent: unknown) => <svg><style>{raw(escapeContent(s))}</style></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "style", root: "svg" } }],
    },
    {
      // A destructured parameter shadows all the same
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = ({ raw }: { raw: unknown }) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A shadowed namespace binding is not the module
      code: `import * as vincle from "@vincle/core";
             import * as html from "@vincle/core/html";
             const p = (vincle: unknown) => <svg><script>{vincle.raw(html.escapeContent(s))}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A local variable shadowing the raw import is not the helper
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (s: string) => {
               const raw = String;
               return <svg><script>{raw(escapeContent(s))}</script></svg>;
             };`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A catch binding shadows too
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (s: string) => {
               try {
                 return null;
               } catch (raw) {
                 return <svg><script>{raw(escapeContent(s))}</script></svg>;
               }
             };`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A var hoisted across blocks still shadows the import: the warning
      // keeps firing (fail-safe direction), it never silently passes
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (s: string) => {
               if (s.length) {
                 var raw = String;
               }
               return <svg><script>{raw(escapeContent(s))}</script></svg>;
             };`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A barrel re-export is the recipe semantically but is not followed:
      // only direct imports from @vincle/core and @vincle/core/html count
      code: `import { raw } from "@vincle/lib";
             import { escapeContent } from "@vincle/lib/html";
             const p = (s: string) => <svg><script>{raw(escapeContent(s))}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
    {
      // A shadowing IIFE inside the child expression: the top-level call is
      // the IIFE, not the helper, so the warning fires even though a
      // recipe-shaped call sits inside it
      code: `import { raw } from "@vincle/core";
             import { escapeContent } from "@vincle/core/html";
             const p = (s: string) =>
               <svg><script>{(() => {
                 const raw = String;
                 return raw(escapeContent(s));
               })()}</script></svg>;`,
      errors: [{ messageId: "foreignRawtext", data: { tag: "script", root: "svg" } }],
    },
  ],
});
