import {
  escapeContent,
  escapeAttr,
  escapeRawText,
  isSafeScheme,
  isSafeSrcset,
  isValidAttrName,
  isValidTagName,
  sanitize,
  RAWTEXT_TAGS,
  RCDATA_TAGS,
} from "./escape.js";
import { describe, it, expect } from "bun:test";

describe("escapeContent", () => {
  it("escapes & < >", () => {
    expect(escapeContent("<b>\"Hello\" & 'World'</b>")).toBe(
      "&lt;b&gt;\"Hello\" &amp; 'World'&lt;/b&gt;",
    );
  });

  it("returns safe string unchanged", () => {
    expect(escapeContent("Hello 123")).toBe("Hello 123");
  });

  it("returns empty string unchanged", () => {
    expect(escapeContent("")).toBe("");
  });

  it("escapes all-escapable string", () => {
    expect(escapeContent("<>&")).toBe("&lt;&gt;&amp;");
  });

  it("escapes when escapable char at position 0", () => {
    expect(escapeContent("<hello>")).toBe("&lt;hello&gt;");
    expect(escapeContent("&hello")).toBe("&amp;hello");
  });

  it("escapes when escapable char at last position", () => {
    expect(escapeContent("hello<")).toBe("hello&lt;");
    expect(escapeContent("hello&")).toBe("hello&amp;");
  });

  it("escapes consecutive chars without merging", () => {
    expect(escapeContent("a&&b")).toBe("a&amp;&amp;b");
    expect(escapeContent("a<<b")).toBe("a&lt;&lt;b");
  });

  it("escapes reinterpreted sequences", () => {
    expect(escapeContent("&amp;")).toBe("&amp;amp;");
  });

  it("fast-paths long safe strings", () => {
    const long = "a".repeat(1000);
    expect(escapeContent(long)).toBe(long);
  });

  it("handles single char", () => {
    expect(escapeContent("&")).toBe("&amp;");
    expect(escapeContent("<")).toBe("&lt;");
    expect(escapeContent(">")).toBe("&gt;");
  });
});

describe("escapeAttr", () => {
  it("escapes & < > \" '", () => {
    expect(escapeAttr("\"><script>'")).toBe(
      "&quot;&gt;&lt;script&gt;&#39;",
    );
  });

  it("returns safe string unchanged", () => {
    expect(escapeAttr("Hello 123")).toBe("Hello 123");
  });

  it("handles all-escapable string", () => {
    expect(escapeAttr("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes double-quote at start", () => {
    expect(escapeAttr('"hello')).toBe("&quot;hello");
    expect(escapeAttr("'hello")).toBe("&#39;hello");
  });

  it("escapes double-quote at end", () => {
    expect(escapeAttr('hello"')).toBe("hello&quot;");
    expect(escapeAttr("hello'")).toBe("hello&#39;");
  });

  it("handles consecutive quotes", () => {
    expect(escapeAttr('a""b')).toBe("a&quot;&quot;b");
    expect(escapeAttr("a''b")).toBe("a&#39;&#39;b");
  });

  it("fast-paths long safe strings", () => {
    const long = "z".repeat(1000);
    expect(escapeAttr(long)).toBe(long);
  });
});

describe("escapeRawText", () => {
  it("escapes </script>", () => {
    expect(escapeRawText("</script>", "script")).toBe("<\\/script>");
  });

  it("escapes </SCRIPT> case-insensitively", () => {
    expect(escapeRawText("</SCRIPT>", "script")).toBe("<\\/SCRIPT>");
  });

  it("escapes </style> for style tag", () => {
    expect(escapeRawText("</style>", "style")).toBe("<\\/style>");
  });

  it("escapes only matching tag name", () => {
    const result = escapeRawText("</script> and </style>", "script");
    expect(result).toBe("<\\/script> and </style>");
  });

  it("escapes multiple occurrences", () => {
    expect(escapeRawText("</script>a</script>b", "script")).toBe(
      "<\\/script>a<\\/script>b",
    );
  });

  it("preserves content without closing tags", () => {
    expect(escapeRawText("var x = 1;", "script")).toBe("var x = 1;");
  });

  it("falls back to entity escaping for non-rawtext tag", () => {
    expect(escapeRawText("<b>&", "div")).toBe("&lt;b&gt;&amp;");
  });

  it("escapes </iframe>", () => {
    expect(escapeRawText("</iframe>", "iframe")).toBe("<\\/iframe>");
  });

  it("escapes </xmp>", () => {
    expect(escapeRawText("</xmp>", "xmp")).toBe("<\\/xmp>");
  });

  it("escapes </noembed>", () => {
    expect(escapeRawText("</noembed>", "noembed")).toBe("<\\/noembed>");
  });

  it("escapes </noframes>", () => {
    expect(escapeRawText("</noframes>", "noframes")).toBe("<\\/noframes>");
  });
});

describe("isSafeScheme", () => {
  it("allows safe URL schemes", () => {
    expect(isSafeScheme("https://example.com")).toBe(true);
    expect(isSafeScheme("/path")).toBe(true);
    expect(isSafeScheme("#anchor")).toBe(true);
    expect(isSafeScheme("?query=1")).toBe(true);
    expect(isSafeScheme("mailto:user@example.com")).toBe(true);
    expect(isSafeScheme("data:image/png;base64,abc")).toBe(true);
  });

  it("blocks javascript:", () => {
    expect(isSafeScheme("javascript:alert(1)")).toBe(false);
  });

  it("blocks vbscript:", () => {
    expect(isSafeScheme("vbscript:alert(1)")).toBe(false);
  });

  it("blocks non-image data URIs", () => {
    expect(isSafeScheme("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });

  it("blocks javascript: with whitespace prefix", () => {
    expect(isSafeScheme("  javascript:alert(1)")).toBe(false);
  });

  it("blocks javascript: with null byte", () => {
    expect(isSafeScheme("java\0script:alert(1)")).toBe(false);
  });

  it("blocks homoglyph attacks", () => {
    const cyrillicA = "j\u0430vascript:alert(1)";
    expect(isSafeScheme(cyrillicA)).toBe(false);
  });
});

describe("isSafeSrcset", () => {
  it("allows valid srcset", () => {
    expect(isSafeSrcset("image-1x.png 1x, image-2x.png 2x")).toBe(true);
    expect(isSafeSrcset("photo.jpg 100w")).toBe(true);
    expect(isSafeSrcset("data:image/png;base64,abc 1x")).toBe(true);
  });

  it("blocks javascript: in srcset", () => {
    expect(isSafeSrcset("img.png 1x, javascript:alert(1) 2x")).toBe(false);
  });

  it("rejects empty candidates", () => {
    expect(isSafeSrcset("img.png,,other.png")).toBe(false);
    expect(isSafeSrcset(",leading.png")).toBe(false);
    expect(isSafeSrcset("trailing.png,")).toBe(false);
  });

  it("rejects malformed descriptors", () => {
    expect(isSafeSrcset("img.png broken")).toBe(false);
    expect(isSafeSrcset("img.png 1xx")).toBe(false);
  });

  it("handles empty srcset", () => {
    expect(isSafeSrcset("")).toBe(true);
    expect(isSafeSrcset("   ")).toBe(true);
  });
});

describe("sanitize", () => {
  it("returns safe input unchanged", () => {
    expect(sanitize("hello-world")).toBe("hello-world");
  });

  it("removes control characters", () => {
    expect(sanitize("a\0b\u0001c")).toBe("abc");
  });

  it("removes zero-width space", () => {
    expect(sanitize("a\u200Bb")).toBe("ab");
  });

  it("removes DEL character", () => {
    expect(sanitize("a\u007Fb")).toBe("ab");
  });
});

describe("isValidAttrName", () => {
  it("allows standard attribute names", () => {
    expect(isValidAttrName("class")).toBe(true);
    expect(isValidAttrName("data-foo")).toBe(true);
    expect(isValidAttrName("@click")).toBe(true);
    expect(isValidAttrName("[prop]")).toBe(true);
    expect(isValidAttrName("(evt)")).toBe(true);
    expect(isValidAttrName("x:y")).toBe(true);
    expect(isValidAttrName("_")).toBe(true);
    expect(isValidAttrName("$")).toBe(true);
  });

  it("blocks structural separators", () => {
    expect(isValidAttrName("a b")).toBe(false);
    expect(isValidAttrName("a=")).toBe(false);
    expect(isValidAttrName('a"')).toBe(false);
    expect(isValidAttrName("a<")).toBe(false);
    expect(isValidAttrName("a>")).toBe(false);
    expect(isValidAttrName("a/")).toBe(false);
  });
});

describe("isValidTagName", () => {
  it("allows any name that cannot break out of a tag", () => {
    expect(isValidTagName("div")).toBe(true);
    expect(isValidTagName("my-component")).toBe(true);
    expect(isValidTagName("h1")).toBe(true);
    // Blocklist, not whitelist: namespaced, underscore, and malformed-but-safe
    // names are accepted (they cannot escape `<...>`) — matches Preact/Hono.
    expect(isValidTagName("svg:rect")).toBe(true);
    expect(isValidTagName("foo_bar")).toBe(true);
    expect(isValidTagName("1div")).toBe(true);
  });

  it("blocks names that could break out of a tag", () => {
    expect(isValidTagName("")).toBe(false);
    expect(isValidTagName("div class")).toBe(false); // whitespace
    expect(isValidTagName("<script>")).toBe(false); // < >
    expect(isValidTagName("img/onerror=x")).toBe(false); // / =
    expect(isValidTagName('a"b')).toBe(false); // quote
    expect(isValidTagName("!doctype")).toBe(false); // leading !
  });
});

describe("RAWTEXT_TAGS", () => {
  it("contains all rawtext elements per spec", () => {
    const expected = ["script", "style", "xmp", "iframe", "noembed", "noframes"];
    for (const tag of expected) {
      expect(RAWTEXT_TAGS.has(tag)).toBe(true);
    }
  });

  it("does not contain RCDATA elements", () => {
    expect(RAWTEXT_TAGS.has("textarea")).toBe(false);
    expect(RAWTEXT_TAGS.has("title")).toBe(false);
  });

  it("does not contain normal HTML elements", () => {
    expect(RAWTEXT_TAGS.has("div")).toBe(false);
  });
});

describe("RCDATA_TAGS", () => {
  it("contains RCDATA elements", () => {
    expect(RCDATA_TAGS.has("textarea")).toBe(true);
    expect(RCDATA_TAGS.has("title")).toBe(true);
  });

  it("does not contain rawtext elements", () => {
    expect(RCDATA_TAGS.has("script")).toBe(false);
    expect(RCDATA_TAGS.has("style")).toBe(false);
  });
});
