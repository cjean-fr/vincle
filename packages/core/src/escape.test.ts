import { describe, expect, test } from "bun:test";

import {
  escapeContent,
  escapeAttr,
  escapeRawTagContent,
  RAWTEXT_TAGS,
  isSafeScheme,
  URL_ATTRIBUTES,
  valueToText,
} from "./escape.js";
import { jsxEscape } from "./jsx-runtime.js";
import { renderNode } from "./render.js";
import { raw, RawString, VNode } from "./types.js";

// ── escapeContent ────────────────────────────────────────────────────────────

describe("escapeContent", () => {
  test("passthrough for clean string", () => {
    expect(escapeContent("hello world")).toBe("hello world");
  });

  test("empty string", () => {
    expect(escapeContent("")).toBe("");
  });

  test("escapes &", () => {
    expect(escapeContent("a & b")).toBe("a &amp; b");
  });

  test("escapes <", () => {
    expect(escapeContent("a < b")).toBe("a &lt; b");
  });

  test("escapes >", () => {
    expect(escapeContent("a > b")).toBe("a &gt; b");
  });

  test("escapes all three & < >", () => {
    expect(escapeContent("<a href='x'> & </a>")).toBe("&lt;a href='x'&gt; &amp; &lt;/a&gt;");
  });

  test("leading special char", () => {
    expect(escapeContent("<script>")).toBe("&lt;script&gt;");
  });

  test("trailing special char", () => {
    expect(escapeContent("text &")).toBe("text &amp;");
  });

  test("only special chars", () => {
    expect(escapeContent("<>&")).toBe("&lt;&gt;&amp;");
  });

  test("adjacent special chars", () => {
    expect(escapeContent("<<>>&&")).toBe("&lt;&lt;&gt;&gt;&amp;&amp;");
  });
});

// ── escapeAttr ────────────────────────────────────────────────────────────

describe("escapeAttr", () => {
  test("passthrough for clean string", () => {
    expect(escapeAttr("hello world")).toBe("hello world");
  });

  test("empty string", () => {
    expect(escapeAttr("")).toBe("");
  });

  test("escapes &", () => {
    expect(escapeAttr("a & b")).toBe("a &amp; b");
  });

  test("escapes double quote", () => {
    expect(escapeAttr('a "quoted" b')).toBe("a &quot;quoted&quot; b");
  });

  test("escapes <", () => {
    expect(escapeAttr("a < b")).toBe("a &lt; b");
  });

  test('does NOT escape > (only &, <, ")', () => {
    expect(escapeAttr("a > b")).toBe("a > b");
  });

  test('escapes all three & < " (but not >)', () => {
    expect(escapeAttr('<a "b" & c>')).toBe("&lt;a &quot;b&quot; &amp; c>");
  });

  test("leading special char", () => {
    expect(escapeAttr('"hello"')).toBe("&quot;hello&quot;");
  });
});

// ── escapeRawTagContent ───────────────────────────────────────────────────

describe("escapeRawTagContent", () => {
  test("passthrough for clean script content", () => {
    expect(escapeRawTagContent("const x = 1;", "script")).toBe("const x = 1;");
  });

  test("passthrough for clean style content", () => {
    expect(escapeRawTagContent("color: red;", "style")).toBe("color: red;");
  });

  test("escapes </script> in script content", () => {
    expect(escapeRawTagContent("</script>", "script")).toBe("\\u003c/script>");
  });

  test("escapes </STYLE> case-insensitive", () => {
    expect(escapeRawTagContent("</STYLE>", "style")).toBe("<\\/STYLE>");
  });

  test("escapes </SCRIPT> case-insensitive", () => {
    expect(escapeRawTagContent("</SCRIPT>", "script")).toBe("\\u003c/SCRIPT>");
  });

  test("escapes multiple close tags", () => {
    expect(escapeRawTagContent("a</script>b</script>c", "script")).toBe(
      "a\\u003c/script>b\\u003c/script>c",
    );
  });

  test("mixed content with close tag", () => {
    expect(escapeRawTagContent('const x = "</script>";', "script")).toBe(
      'const x = "\\u003c/script>";',
    );
  });

  test("non-rawtext tag falls back to escapeContent", () => {
    expect(escapeRawTagContent("<script>", "div")).toBe("&lt;script&gt;");
  });

  test("empty string", () => {
    expect(escapeRawTagContent("", "script")).toBe("");
  });
});

// ── RAWTEXT_TAGS ──────────────────────────────────────────────────────────

describe("RAWTEXT_TAGS", () => {
  test("contains script and style", () => {
    expect(RAWTEXT_TAGS.has("script")).toBe(true);
    expect(RAWTEXT_TAGS.has("style")).toBe(true);
  });

  test("does not contain non-rawtext tags", () => {
    expect(RAWTEXT_TAGS.has("div")).toBe(false);
    expect(RAWTEXT_TAGS.has("span")).toBe(false);
    expect(RAWTEXT_TAGS.has("template")).toBe(false);
  });

  test("has exactly 2 entries", () => {
    expect(RAWTEXT_TAGS.size).toBe(2);
  });
});

// ── isSafeScheme ───────────────────────────────────────────────────────────

describe("isSafeScheme", () => {
  test("relative paths: / # ?", () => {
    expect(isSafeScheme("/page")).toBe(true);
    expect(isSafeScheme("#section")).toBe(true);
    expect(isSafeScheme("?query=1")).toBe(true);
  });

  test("mailto:", () => {
    expect(isSafeScheme("mailto:user@example.com")).toBe(true);
  });

  test("http / https", () => {
    expect(isSafeScheme("http://example.com")).toBe(true);
    expect(isSafeScheme("https://example.com")).toBe(true);
    expect(isSafeScheme("HTTP://example.com")).toBe(true);
  });

  test("blocks javascript:", () => {
    expect(isSafeScheme("javascript:alert(1)")).toBe(false);
    expect(isSafeScheme("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isSafeScheme(" javascript:alert(1)")).toBe(false);
    expect(isSafeScheme("javascript:")).toBe(false);
  });

  test("blocks vbscript:", () => {
    expect(isSafeScheme("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeScheme("VBSCRIPT:msgbox(1)")).toBe(false);
  });

  test("data:image allowed", () => {
    expect(isSafeScheme("data:image/png;base64,abc")).toBe(true);
    expect(isSafeScheme("data:image/jpeg;base64,xyz")).toBe(true);
    expect(isSafeScheme("data:image/gif;base64,xyz")).toBe(true);
    expect(isSafeScheme("data:image/webp;base64,xyz")).toBe(true);
    expect(isSafeScheme("data:image/avif;base64,xyz")).toBe(true);
  });

  test("non-image data: blocked", () => {
    expect(isSafeScheme("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  test("no scheme — safe", () => {
    expect(isSafeScheme("example.com")).toBe(true);
    expect(isSafeScheme("local")).toBe(true);
  });

  test("empty or whitespace", () => {
    expect(isSafeScheme("")).toBe(true);
    expect(isSafeScheme("  ")).toBe(true);
  });

  // A scheme is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"`. A prefix that
  // cannot be one is not a scheme the check should judge — it is a relative
  // reference, and the browser resolves it against the document.
  //
  //   new URL("écho:test", base).protocol         === "https:"   (relative)
  //   new URL("recherche?q=café:x", base).protocol === "https:"   (relative)
  //
  // Both used to be rewritten to `#blocked`: the scan looked for the first ":"
  // and rejected anything non-ASCII before it, without asking whether a scheme
  // could start there at all. A French path with a colon later in the query is an
  // ordinary URL, and it stopped resolving.
  test("a prefix that cannot be a scheme is a relative reference, not a threat", () => {
    expect(isSafeScheme("écho:test")).toBe(true);
    expect(isSafeScheme("recherche?q=café:test")).toBe(true);
    expect(isSafeScheme("поиск?q=a:b")).toBe(true);
    expect(isSafeScheme("/agenda/10:30")).toBe(true);
    expect(isSafeScheme("a/b:c")).toBe(true);
    expect(isSafeScheme(":no-scheme")).toBe(true);
  });

  // Homograph attempt: Cyrillic "а" in "jаvascript". Not a scheme character, so
  // no parser reads a scheme here either — and nothing executes.
  test("a homograph scheme is not a scheme", () => {
    expect(new URL("jаvascript:alert(1)", "https://example.test/").protocol).toBe("https:");
    expect(isSafeScheme("jаvascript:alert(1)")).toBe(true);
  });

  test("a real scheme is still judged, whatever follows it", () => {
    expect(isSafeScheme("javascript:alert('café')")).toBe(false);
    expect(isSafeScheme("JavaScript:alert(1)")).toBe(false);
    expect(isSafeScheme("view-source:https://x")).toBe(true);
    expect(isSafeScheme("web+app:x")).toBe(true);
  });

  // ── Scheme obfuscation ──
  //
  // A URL parser rewrites its input before it looks at the scheme: it removes
  // every ASCII tab and newline, and strips leading C0 controls and space. So a
  // regex applied to the raw string tests a string the browser never parses.
  // Each case below reached the document verbatim before the fix.

  test("blocks javascript: with interior tab / LF / CR", () => {
    expect(isSafeScheme("java\tscript:alert(1)")).toBe(false);
    expect(isSafeScheme("java\nscript:alert(1)")).toBe(false);
    expect(isSafeScheme("java\rscript:alert(1)")).toBe(false);
    expect(isSafeScheme("j\ta\nv\ra\tscript:alert(1)")).toBe(false);
    expect(isSafeScheme("vb\tscript:msgbox(1)")).toBe(false);
  });

  test("blocks javascript: behind leading C0 controls", () => {
    expect(isSafeScheme("\0javascript:alert(1)")).toBe(false);
    expect(isSafeScheme("\x01javascript:alert(1)")).toBe(false);
    expect(isSafeScheme("\x1fjavascript:alert(1)")).toBe(false);
    expect(isSafeScheme("\t\njavascript:alert(1)")).toBe(false);
  });

  test("blocks non-image data: behind the same obfuscation", () => {
    expect(isSafeScheme("da\tta:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeScheme("\0data:text/html,x")).toBe(false);
  });

  /**
   * Differential test against the platform's own WHATWG URL parser — the same
   * algorithm the browser applies. It is the only oracle that cannot drift from
   * what a browser will actually execute, and it decides these cases rather
   * than a hand-written list.
   *
   * The contract is one-directional on purpose: whenever the parser resolves an
   * input to an executable scheme, `isSafeScheme` must reject it. The converse
   * does not hold — rejecting more than the parser executes is allowed.
   */
  test("agrees with WHATWG URL on every executable scheme", () => {
    const EXECUTABLE = new Set(["javascript:", "vbscript:"]);
    const bases = ["javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html,<b>x</b>"];
    // Every mutation a URL parser undoes, applied at every position.
    const noise = ["\t", "\n", "\r", "\0", "\x01", " "];

    const inputs: string[] = [];
    for (const base of bases) {
      inputs.push(base);
      for (const n of noise) {
        inputs.push(n + base);
        inputs.push(base.slice(0, 3) + n + base.slice(3));
        inputs.push(base.slice(0, 1) + n + base.slice(1));
      }
    }

    const missed: string[] = [];
    for (const input of inputs) {
      let protocol: string;
      try {
        protocol = new URL(input, "https://example.test/").protocol;
      } catch {
        continue; // not a URL at all — nothing to execute
      }
      const executable =
        EXECUTABLE.has(protocol) || (protocol === "data:" && !/^data:image\//i.test(input.trim()));
      if (executable && isSafeScheme(input)) missed.push(JSON.stringify(input));
    }

    expect(missed).toEqual([]);
  });
});

// ── URL_ATTRIBUTES ─────────────────────────────────────────────────────────

describe("URL_ATTRIBUTES", () => {
  test("contains href, src, action, formaction, xlink:href", () => {
    expect(URL_ATTRIBUTES.has("href")).toBe(true);
    expect(URL_ATTRIBUTES.has("src")).toBe(true);
    expect(URL_ATTRIBUTES.has("action")).toBe(true);
    expect(URL_ATTRIBUTES.has("formaction")).toBe(true);
    expect(URL_ATTRIBUTES.has("xlink:href")).toBe(true);
  });

  // `<object data>` navigates the same way `<iframe src>` does; `src` was
  // already covered, `data` was the gap.
  test("contains data (<object data>)", () => {
    expect(URL_ATTRIBUTES.has("data")).toBe(true);
  });

  test("does not contain non-URL attributes", () => {
    expect(URL_ATTRIBUTES.has("id")).toBe(false);
    expect(URL_ATTRIBUTES.has("class")).toBe(false);
    expect(URL_ATTRIBUTES.has("style")).toBe(false);
    expect(URL_ATTRIBUTES.has("srcset")).toBe(false);
  });

  test("has exactly 6 entries", () => {
    expect(URL_ATTRIBUTES.size).toBe(6);
  });
});

// ── escapeRawTagContent — <script> tokenizer states ────────────────────────
//
// `<script>` is SCRIPT_DATA, not RAWTEXT: `<!--` opens *script data escaped* and
// a following `<script` opens *script data double escaped*, a state in which
// `</script>` no longer closes the element. Neutralizing `</script` alone left
// the renderer's own closing tag inert. Asserted here against a real HTML5
// parser, because the failure is invisible in the output string.

describe("escapeRawTagContent — script data double escape", () => {
  const tagsOf = async (html: string): Promise<string[]> => {
    const seen: string[] = [];
    await new HTMLRewriter()
      .on("*", {
        element(el) {
          seen.push(el.tagName);
        },
      })
      .transform(new Response(html))
      .text();
    return seen;
  };

  const page = (body: string) =>
    `<div><script>${escapeRawTagContent(body, "script")}</script><p>after</p></div>`;

  test("baseline: benign script content keeps the document intact", async () => {
    expect(await tagsOf(page("var x = 1;"))).toEqual(["div", "script", "p"]);
  });

  test("</script> injection cannot close the element", async () => {
    expect(await tagsOf(page("</script><img src=x onerror=alert(1)>"))).toEqual([
      "div",
      "script",
      "p",
    ]);
  });

  test("<!--<script> no longer swallows the rest of the document", async () => {
    expect(await tagsOf(page("<!--<script>"))).toEqual(["div", "script", "p"]);
    expect(await tagsOf(page("<!--<script>*/</script><img src=x onerror=alert(1)>"))).toEqual([
      "div",
      "script",
      "p",
    ]);
  });

  test("both <script and </script are neutralized, in any case", () => {
    expect(escapeRawTagContent("</script", "script")).toBe("\\u003c/script");
    expect(escapeRawTagContent("<script", "script")).toBe("\\u003cscript");
    expect(escapeRawTagContent("<!--<script></SCRIPT>", "script")).toBe(
      "<!--\\u003cscript>\\u003c/SCRIPT>",
    );
  });

  // Breaking `<script` already disarms the pair, and `<!--` on its own line is
  // valid JavaScript under Annex B — escaping it would turn working source into
  // a syntax error.
  test("<!-- is left intact", () => {
    expect(escapeRawTagContent("<!--", "script")).toBe("<!--");
    expect(escapeRawTagContent("<!-- x -->", "script")).toBe("<!-- x -->");
  });

  // `document.write("<script src=…>")` is a real pattern: `"\u003c"` reads back
  // as `"<"`, so the string the script sees is unchanged.
  test("neutralization is transparent inside a JS string literal", () => {
    const escaped = escapeRawTagContent('document.write("<script src=x></script>")', "script");
    expect(escaped).toBe('document.write("\\u003cscript src=x>\\u003c/script>")');
    // eslint-disable-next-line no-eval
    expect(eval(escaped.replace("document.write", "String"))).toBe("<script src=x></script>");
  });

  // The reason the escape is a unicode escape rather than the `<\` the HTML spec
  // suggests: a `<script>` with a non-JS `type` is a data block, and the ones
  // that occur hold JSON — where `\s` is a parse error, not the identity.
  test("neutralization is transparent inside a JSON string literal", () => {
    const json = JSON.stringify({ "@type": "Article", name: "</script><img src=x>" });
    const escaped = escapeRawTagContent(json, "script");

    expect(escaped).toContain("\\u003c/script>");
    expect(JSON.parse(escaped)).toEqual({ "@type": "Article", name: "</script><img src=x>" });
  });

  test("style is RAWTEXT — only </style matters", () => {
    expect(escapeRawTagContent("<!--", "style")).toBe("<!--");
    expect(escapeRawTagContent("<style", "style")).toBe("<style");
    expect(escapeRawTagContent("</style>", "style")).toBe("<\\/style>");
  });

  // CSS reads `\u` as a literal `u` — `\` + non-hex is that character — so the
  // two tags cannot share one escape form. Asserted so that unifying them again
  // fails here rather than silently in a stylesheet.
  test("style keeps the backslash form, which CSS reads back", () => {
    const escaped = escapeRawTagContent('.a::after { content: "</style>" }', "style");
    expect(escaped).toBe('.a::after { content: "<\\/style>" }');
    expect(escaped).not.toContain("\\u003c");
  });

  test("content with nothing to neutralize is returned unchanged", () => {
    const s = "body { color: red } /* <3 */";
    expect(escapeRawTagContent(s, "script")).toBe(s);
    expect(escapeRawTagContent(s, "style")).toBe(s);
  });
});

// ── valueToText ≡ the walks' inline leaf taxonomy ─────────────────────────
//
// The walks keep an inline copy of the leaf taxonomy (delegation is measurably
// slower); this test proves the copies agree.

describe("valueToText ≡ the walks' inline leaf taxonomy", () => {
  const LEAVES: unknown[] = [
    null,
    undefined,
    true,
    false,
    "",
    "hello world",
    "a & b < c > d",
    "<script>alert(1)</script>",
    "café ☕ résumé",
    "&<>",
    0,
    -0,
    42,
    3.14,
    NaN,
    Infinity,
    -Infinity,
    1e21,
    1e-7,
    0n,
    123456789012345678901234567890n,
    -42n,
    raw("<b>trusted</b>"),
    raw(""),
    { toString: () => "custom object" },
    new Date(0),
    () => "fn",
    Symbol("s"),
  ];

  test("valueToText, renderNode and jsxEscape agree", async () => {
    const failures: string[] = [];
    for (const v of LEAVES) {
      const norm = valueToText(v);

      const walk = renderNode(v);
      if (typeof walk !== "string" || walk !== norm) {
        failures.push(
          `renderNode(${String(v)}) → ${JSON.stringify(walk)} ≠ ${JSON.stringify(norm)}`,
        );
      }

      const pre = jsxEscape(v);
      if (!(pre instanceof RawString) || pre.value !== norm) {
        failures.push(`jsxEscape(${String(v)}) → ${JSON.stringify(pre)} ≠ ${JSON.stringify(norm)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("a VNode is not a text value — valueToText throws", () => {
    expect(() => valueToText(new VNode("div", {}, null))).toThrow(/tree walk/);
  });
});
