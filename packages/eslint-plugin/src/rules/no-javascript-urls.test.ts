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

// ── Differential vs WHATWG URL ─────────────────────────────────────────────
/**
 * Differential test against the platform's own WHATWG URL parser.
 *
 * A hand-written list of obfuscations is only ever as good as the author's
 * imagination, and that is exactly how `isSafeScheme` in `@vincle/core` shipped
 * with four live bypasses while this rule already handled them. So the oracle is
 * not a list: it is `new URL`, which runs the same algorithm the browser runs.
 * Whatever it resolves to an executable scheme, the rule must report — and
 * whatever it resolves to an inert one, the rule must not.
 *
 * Scope is deliberately narrower than the runtime's. This rule is
 * `no-javascript-urls`: `data:text/html,…` resolves to `data:`, which the rule
 * leaves alone and `buildAttrs` blocks at render time. The assertion below
 * pins that split rather than letting it be an accident.
 */

const EXECUTABLE = new Set(["javascript:", "vbscript:"]);

const BASES = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "vbscript:msgbox(1)",
  "VBSCRIPT:msgbox(1)",
  "https://example.test/p",
  "/page",
  "#frag",
  "mailto:a@b.c",
  "data:image/png;base64,abc",
  "data:text/html,<b>x</b>",
  "/path?x=javascript:foo",
];

/** Every character a URL parser removes before it reads the scheme. */
const NOISE = ["\t", "\n", "\r", "\0", "\x01", "\x1f", " "];

/** `<a href={"…"}>` — an expression container so escapes survive the JSX parser. */
const ATTRS = ["href", "src", "action", "formaction", "data"];

function inputs(): string[] {
  const out = new Set<string>();
  for (const base of BASES) {
    out.add(base);
    for (const n of NOISE) {
      out.add(n + base); // leading
      out.add(base + n); // trailing
      out.add(base.slice(0, 1) + n + base.slice(1)); // inside the scheme
      out.add(base.slice(0, 3) + n + base.slice(3)); // inside the scheme
    }
  }
  return [...out];
}

/** What a browser would actually do with this string. */
function isExecutable(url: string): boolean {
  try {
    return EXECUTABLE.has(new URL(url, "https://example.test/").protocol);
  } catch {
    return false; // not a URL at all — nothing to execute
  }
}

const valid: string[] = [];
const invalid: { code: string; errors: [{ messageId: string }] }[] = [];

for (const attr of ATTRS) {
  for (const url of inputs()) {
    const code = `<a ${attr}={${JSON.stringify(url)}}></a>`;
    if (isExecutable(url)) invalid.push({ code, errors: [{ messageId: "noJavascriptUrl" }] });
    else valid.push(code);
  }
}

// A generator that produced no dangerous case would make the suite vacuously
// green, so the counts are asserted before the rule ever runs.
if (invalid.length === 0 || valid.length === 0) {
  throw new Error(`degenerate corpus: ${invalid.length} executable, ${valid.length} inert`);
}

ruleTester.run("no-javascript-urls — differential vs WHATWG URL", noJavascriptUrls, {
  valid,
  invalid,
});
