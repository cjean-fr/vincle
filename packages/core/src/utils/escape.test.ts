import {
  escapeContent,
  escapeAttr,
  escapeRawText,
  isSafeSrcset,
  isSafeScheme,
  isValidAttrName,
  sanitize,
  RAWTEXT_TAGS,
  RCDATA_TAGS,
} from "./escape.js";
import { describe, it, expect } from "bun:test";

describe("escape utilities", () => {
  describe("escapeContent", () => {
    it("escapes for HTML content", () => {
      expect(escapeContent("<b>\"Hello\" & 'World'</b>")).toBe(
        "&lt;b&gt;\"Hello\" &amp; 'World'&lt;/b&gt;",
      );
      expect(escapeContent("Hello 123")).toBe("Hello 123");
    });

    it("returns empty string unchanged", () => {
      expect(escapeContent("")).toBe("");
    });

    it("escapes only escapable chars when input has no safe runs", () => {
      expect(escapeContent("<>&")).toBe("&lt;&gt;&amp;");
    });

    it("escapes when escapable char appears at position 0", () => {
      expect(escapeContent("<hello>")).toBe("&lt;hello&gt;");
      expect(escapeContent("&hello")).toBe("&amp;hello");
    });

    it("escapes when escapable char appears at last position", () => {
      expect(escapeContent("hello<")).toBe("hello&lt;");
      expect(escapeContent("hello&")).toBe("hello&amp;");
    });

    it("escapes consecutive escapable chars without merging", () => {
      expect(escapeContent("a&&b")).toBe("a&amp;&amp;b");
      expect(escapeContent("a<<b")).toBe("a&lt;&lt;b");
    });

    it("escapes reinterpreted sequences (e.g. &amp; → &amp;amp;)", () => {
      expect(escapeContent("&amp;")).toBe("&amp;amp;");
    });

    it("fast-paths through a long string with no escapable chars", () => {
      const long = "a".repeat(1000);
      expect(escapeContent(long)).toBe(long);
    });

    it("escapes multiple escapable char types scattered across a long string", () => {
      const input =
        "a".repeat(100) + "&" + "b".repeat(100) + "<" + "c".repeat(100);
      const expected =
        "a".repeat(100) + "&amp;" + "b".repeat(100) + "&lt;" + "c".repeat(100);
      expect(escapeContent(input)).toBe(expected);
    });

    it("escapes a single escapable char at any position in short input", () => {
      expect(escapeContent("&")).toBe("&amp;");
      expect(escapeContent("<")).toBe("&lt;");
      expect(escapeContent(">")).toBe("&gt;");
    });

    it("escapes when the only escapable char ends a long safe prefix", () => {
      expect(escapeContent("abcde&fgh")).toBe("abcde&amp;fgh");
    });
  });

  describe("escapeAttr", () => {
    it("escapes for HTML attributes", () => {
      const attr = escapeAttr("\"><script>'");
      expect(attr).toBe("&quot;&gt;&lt;script&gt;&#39;");
      expect(escapeAttr("Hello 123")).toBe("Hello 123");
    });

    it("handles empty string", () => {
      expect(escapeAttr("")).toBe("");
    });

    it("handles string with only escapable chars", () => {
      expect(escapeAttr("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
    });

    it("handles string starting with an escapable char", () => {
      expect(escapeAttr('"hello')).toBe("&quot;hello");
      expect(escapeAttr("'hello")).toBe("&#39;hello");
    });

    it("handles string ending with an escapable char", () => {
      expect(escapeAttr('hello"')).toBe("hello&quot;");
      expect(escapeAttr("hello'")).toBe("hello&#39;");
    });

    it("handles double-quote specifically", () => {
      expect(escapeAttr('"')).toBe("&quot;");
      expect(escapeAttr('"""')).toBe("&quot;&quot;&quot;");
    });

    it("handles single-quote specifically", () => {
      expect(escapeAttr("'")).toBe("&#39;");
      expect(escapeAttr("''''")).toBe("&#39;&#39;&#39;&#39;");
    });

    it("handles multiple consecutive escapable chars", () => {
      expect(escapeAttr('a""b')).toBe("a&quot;&quot;b");
      expect(escapeAttr("a''b")).toBe("a&#39;&#39;b");
    });

    it("handles long string with no escapable chars", () => {
      const long = "z".repeat(1000);
      expect(escapeAttr(long)).toBe(long);
    });

    it("handles long string with escapable chars at boundaries", () => {
      const input = '"' + "x".repeat(100) + "'" + "y".repeat(100);
      const expected = "&quot;" + "x".repeat(100) + "&#39;" + "y".repeat(100);
      expect(escapeAttr(input)).toBe(expected);
    });

    it("handles string where escapable char is the last of a long prefix", () => {
      expect(escapeAttr('abcde"fgh')).toBe("abcde&quot;fgh");
      expect(escapeAttr("abcde'fgh")).toBe("abcde&#39;fgh");
    });
  });

  describe("isSafeScheme", () => {
    it("requires the scheme to start at position 0 (anchored)", () => {
      expect(isSafeScheme("not-javascript:alert(1)")).toBe(true);
    });
    it("allows safe URLs and data-images", () => {
      expect(isSafeScheme("https://example.com")).toBe(true);
      expect(isSafeScheme("/path")).toBe(true);
      expect(isSafeScheme("data:image/png;base64,abc")).toBe(true);
      expect(isSafeScheme("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
      expect(isSafeScheme("data:image/gif;base64,R0lGOD")).toBe(true);
      expect(isSafeScheme("data:image/webp;base64,UklGR")).toBe(true);
      expect(isSafeScheme("data:image/avif;base64,AAAA")).toBe(true);
      expect(isSafeScheme("")).toBe(true);
    });

    it("blocks dangerous protocols and bypasses", () => {
      expect(isSafeScheme("javascript:alert(1)")).toBe(false);
      expect(isSafeScheme("  JAVASCRIPT:alert(1)")).toBe(false);
      expect(isSafeScheme("java\0script:alert(1)")).toBe(false);
      expect(isSafeScheme("data:text/html,hack")).toBe(false);
      expect(isSafeScheme("java\tscript:alert(1)")).toBe(false);
      expect(isSafeScheme("java\nscript:alert(1)")).toBe(false);
    });

    it("blocks data:image/svg+xml (scriptable SVG)", () => {
      expect(isSafeScheme("data:image/svg+xml,<script>alert(1)</script>")).toBe(
        false,
      );
      expect(
        isSafeScheme("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"),
      ).toBe(false);
    });

    it("blocks javascript: with Cyrillic homoglyph (U+0430)", () => {
      // Cyrillic small letter 'а' (U+0430) looks like ASCII 'a' (U+0061)
      const cyrillicA = "j\u0430vascript:alert(1)";
      expect(isSafeScheme(cyrillicA)).toBe(false);
    });

    it("blocks javascript: with mixed homoglyph obfuscation", () => {
      // Cyrillic 'а' + Latin mix
      const mixed = "j\u0430v\u0430script:alert(1)";
      expect(isSafeScheme(mixed)).toBe(false);
    });

    it("blocks javascript: with fullwidth characters", () => {
      // Fullwidth exclamation mark / colon etc. in scheme
      const fullwidth = "\uFF4A\uFF41\uFF56\uFF41script:alert(1)";
      expect(isSafeScheme(fullwidth)).toBe(false);
    });

    it("does not block valid Unicode in URL path", () => {
      expect(isSafeScheme("https://пример.com/путь")).toBe(true);
    });
  });

  describe("isSafeSrcset", () => {
    it("rejects consecutive commas (empty middle candidate)", () => {
      expect(isSafeSrcset("a.png,,b.png")).toBe(false);
    });
    it("allows safe image candidate lists", () => {
      expect(isSafeSrcset("image-1x.png 1x, image-2x.png 2x")).toBe(true);
      expect(isSafeSrcset("data:image/png;base64,abc 1x")).toBe(true);
      expect(isSafeSrcset("banner.png 100w, banner-hd.png 200w")).toBe(true);
      expect(isSafeSrcset("photo.jpg 1.5x, photo-2x.jpg 2x")).toBe(true);
    });

    it("blocks dangerous schemes in any candidate", () => {
      expect(
        isSafeSrcset("https://example.com/img.png 1x, javascript:alert(1) 2x"),
      ).toBe(false);
      expect(
        isSafeSrcset(
          "data:image/png;base64,abc 1x, data:text/html,<svg onload=alert(1)> 2x",
        ),
      ).toBe(false);
    });

    it("rejects empty candidates", () => {
      expect(isSafeSrcset("img.png,,other.png")).toBe(false);
      expect(isSafeSrcset(",leading.png")).toBe(false);
      expect(isSafeSrcset("trailing.png,")).toBe(false);
    });

    it("rejects malformed descriptors", () => {
      expect(isSafeSrcset("img.png broken")).toBe(false);
      expect(isSafeSrcset("img.png 1xx")).toBe(false);
      expect(isSafeSrcset("img.png abc")).toBe(false);
      expect(isSafeSrcset("img.png 100")).toBe(false);
      expect(isSafeSrcset("img.png 100h")).toBe(false);
    });

    it("rejects empty srcset", () => {
      expect(isSafeSrcset("")).toBe(true);
      expect(isSafeSrcset("   ")).toBe(true);
    });

    it("handles Unicode whitespace between candidates", () => {
      expect(isSafeSrcset("img1.png 1x,\u00A0img2.png 2x")).toBe(true);
      expect(isSafeSrcset("img1.png 1x,\u00A0javascript:alert(1) 2x")).toBe(
        false,
      );
    });
  });

  describe("sanitize", () => {
    it("returns input unchanged when no control chars exist (fast-path)", () => {
      expect(sanitize("hello-world")).toBe("hello-world");
    });

    it("removes all invisible Unicode characters", () => {
      expect(sanitize("a\0b\u0001c\u200Bd")).toBe("abcd");
    });

    it("removes the DEL character (U+007F)", () => {
      expect(sanitize("a\u007Fb")).toBe("ab");
      expect(sanitize("\u007F")).toBe("");
    });
  });

  describe("isValidAttrName", () => {
    it("allows standard, framework and special symbols", () => {
      const valid = [
        "class",
        "data-f",
        "@click",
        "[prop]",
        "(evt)",
        "x:y",
        "a.b",
        "_",
        "$",
      ];
      valid.forEach((name) => expect(isValidAttrName(name)).toBe(true));
    });

    it("blocks structural separators", () => {
      const invalid = ["a b", "a=", 'a"', "a'", "a<", "a>", "a/"];
      invalid.forEach((name) => expect(isValidAttrName(name)).toBe(false));
    });
  });

  describe("RAWTEXT_TAGS", () => {
    it("contains all HTML rawtext elements per spec", () => {
      expect(RAWTEXT_TAGS.has("script")).toBe(true);
      expect(RAWTEXT_TAGS.has("style")).toBe(true);
      expect(RAWTEXT_TAGS.has("xmp")).toBe(true);
      expect(RAWTEXT_TAGS.has("iframe")).toBe(true);
      expect(RAWTEXT_TAGS.has("noembed")).toBe(true);
      expect(RAWTEXT_TAGS.has("noframes")).toBe(true);
    });

    it("does not contain RCDATA elements", () => {
      expect(RAWTEXT_TAGS.has("textarea")).toBe(false);
      expect(RAWTEXT_TAGS.has("title")).toBe(false);
    });

    it("does not contain normal HTML elements", () => {
      expect(RAWTEXT_TAGS.has("div")).toBe(false);
      expect(RAWTEXT_TAGS.has("p")).toBe(false);
    });
  });

  describe("RCDATA_TAGS", () => {
    it("contains all HTML RCDATA elements per spec", () => {
      expect(RCDATA_TAGS.has("textarea")).toBe(true);
      expect(RCDATA_TAGS.has("title")).toBe(true);
    });

    it("does not contain rawtext elements", () => {
      expect(RCDATA_TAGS.has("script")).toBe(false);
      expect(RCDATA_TAGS.has("style")).toBe(false);
    });
  });

  describe("escapeRawText", () => {
    it("escapes </script> to <\\/script>", () => {
      expect(escapeRawText("</script>", "script")).toBe("<\\/script>");
    });

    it("escapes </SCRIPT> case-insensitively", () => {
      expect(escapeRawText("</SCRIPT>", "script")).toBe("<\\/SCRIPT>");
    });

    it("escapes </Script> case-insensitively", () => {
      expect(escapeRawText("</Script>", "script")).toBe("<\\/Script>");
    });

    it("escapes </style> to <\\/style>", () => {
      expect(escapeRawText("</style>", "style")).toBe("<\\/style>");
    });

    it("escapes only the matching tag name", () => {
      const result = escapeRawText("</script> and </style>", "script");
      expect(result).toBe("<\\/script> and </style>");
    });

    it("escapes multiple occurrences of the same tag", () => {
      expect(escapeRawText("</script>a</script>b", "script")).toBe(
        "<\\/script>a<\\/script>b",
      );
    });

    it("preserves content without closing tags", () => {
      expect(escapeRawText("var x = 1;", "script")).toBe("var x = 1;");
    });

    it("preserves standalone < and / that are not followed by tag name", () => {
      expect(escapeRawText("a < b / c > d", "script")).toBe("a < b / c > d");
    });

    it("escapes </iframe> to <\\/iframe>", () => {
      expect(escapeRawText("</iframe>", "iframe")).toBe("<\\/iframe>");
    });

    it("escapes </xmp> to <\\/xmp>", () => {
      expect(escapeRawText("</xmp>", "xmp")).toBe("<\\/xmp>");
    });

    it("escapes </noembed> to <\\/noembed>", () => {
      expect(escapeRawText("</noembed>", "noembed")).toBe("<\\/noembed>");
    });

    it("escapes </noframes> to <\\/noframes>", () => {
      expect(escapeRawText("</noframes>", "noframes")).toBe("<\\/noframes>");
    });

    it("preserves text with no </tagName anywhere", () => {
      const safe = "const a = 42;\nconsole.log(a);";
      expect(escapeRawText(safe, "script")).toBe(safe);
    });
  });

  it("falls back to entity escaping for a non-rawtext tag", () => {
    expect(escapeRawText("<b>&", "div")).toBe("&lt;b&gt;&amp;");
  });
});
