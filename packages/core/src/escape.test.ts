import { describe, expect, test } from "bun:test";

import { escapeContent, escapeAttr, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";

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
    expect(escapeRawTagContent("</script>", "script")).toBe("<\\/script>");
  });

  test("escapes </STYLE> case-insensitive", () => {
    expect(escapeRawTagContent("</STYLE>", "style")).toBe("<\\/STYLE>");
  });

  test("escapes multiple close tags", () => {
    expect(escapeRawTagContent("a</script>b</script>c", "script")).toBe(
      "a<\\/script>b<\\/script>c",
    );
  });

  test("mixed content with close tag", () => {
    expect(escapeRawTagContent('const x = "</script>";', "script")).toBe(
      'const x = "<\\/script>";',
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
