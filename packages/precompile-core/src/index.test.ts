import {
  collapseJsxWhitespace,
  escapeAttr,
  isEventHandlerName,
  isLower,
  isLowercaseTag,
  isUrlAttribute,
  isValidAttrName,
  isVoidElement,
  hasSpreadOrInnerHTML,
  remapAttrName,
  RUNTIME_SOURCE,
  VOID_ELEMENTS,
  URL_ATTRIBUTES,
  ATTRIBUTE_NAME_MAP,
} from "./index.js";
import { describe, it, expect } from "bun:test";

describe("precompile-core", () => {
  describe("isLower", () => {
    it("returns true for lowercase first char", () => {
      expect(isLower("div")).toBe(true);
      expect(isLower("span")).toBe(true);
      expect(isLower("svg")).toBe(true);
      expect(isLower("a")).toBe(true);
    });

    it("returns false for uppercase first char", () => {
      expect(isLower("Div")).toBe(false);
      expect(isLower("MyComponent")).toBe(false);
      expect(isLower("A")).toBe(false);
    });

    it("returns false for non-alpha first char", () => {
      expect(isLower("123")).toBe(false);
      expect(isLower("")).toBe(false);
    });
  });

  describe("isLowercaseTag", () => {
    it("delegates to isLower", () => {
      expect(isLowercaseTag("div")).toBe(true);
      expect(isLowercaseTag("MyComponent")).toBe(false);
    });
  });

  describe("hasSpreadOrInnerHTML", () => {
    it("returns false for simple attrs", () => {
      expect(
        hasSpreadOrInnerHTML([
          { kind: "attribute" as const, name: "class" },
          { kind: "attribute" as const, name: "id" },
        ]),
      ).toBe(false);
    });

    it("returns true for spread attrs", () => {
      expect(
        hasSpreadOrInnerHTML([
          { kind: "attribute" as const, name: "class" },
          { kind: "spread" as const },
        ]),
      ).toBe(true);
    });

    it("returns true for dangerouslySetInnerHTML", () => {
      expect(
        hasSpreadOrInnerHTML([
          { kind: "attribute" as const, name: "dangerouslySetInnerHTML" },
        ]),
      ).toBe(true);
    });

    it("returns false for empty iterable", () => {
      expect(hasSpreadOrInnerHTML([])).toBe(false);
    });
  });

  describe("collapseJsxWhitespace", () => {
    it("drops whitespace-only text that spans a newline", () => {
      expect(collapseJsxWhitespace("\n          ")).toBe("");
      expect(collapseJsxWhitespace("\n  hello\n")).toBe("hello");
    });

    it("joins non-blank lines with a single space", () => {
      expect(collapseJsxWhitespace("hello\n  world")).toBe("hello world");
    });

    it("preserves single-line significant whitespace", () => {
      expect(collapseJsxWhitespace("hello ")).toBe("hello ");
      expect(collapseJsxWhitespace(" ")).toBe(" ");
      expect(collapseJsxWhitespace("a b c")).toBe("a b c");
    });

    it("treats tabs as spaces", () => {
      expect(collapseJsxWhitespace("a\tb")).toBe("a b");
    });
  });

  describe("isVoidElement", () => {
    it("is true for HTML void elements", () => {
      expect(isVoidElement("input")).toBe(true);
      expect(isVoidElement("br")).toBe(true);
      expect(isVoidElement("img")).toBe(true);
    });

    it("is false for normal elements", () => {
      expect(isVoidElement("div")).toBe(false);
      expect(isVoidElement("span")).toBe(false);
    });
  });

  describe("escapeAttr", () => {
    it("returns clean values unchanged", () => {
      expect(escapeAttr("/path?a=1")).toBe("/path?a=1");
      expect(escapeAttr("hello world")).toBe("hello world");
    });

    it("escapes &, <, >, and double quotes", () => {
      expect(escapeAttr(`a"b`)).toBe("a&quot;b");
      expect(escapeAttr("a&b<c>d")).toBe("a&amp;b&lt;c&gt;d");
    });

    it("escapes single quotes", () => {
      expect(escapeAttr("a'b")).toBe("a&#39;b");
    });
  });

  describe("isUrlAttribute", () => {
    it("is true for URL-bearing attributes", () => {
      expect(isUrlAttribute("href")).toBe(true);
      expect(isUrlAttribute("src")).toBe(true);
      expect(isUrlAttribute("srcset")).toBe(true);
      expect(isUrlAttribute("xlink:href")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isUrlAttribute("HREF")).toBe(true);
    });

    it("is false for ordinary attributes", () => {
      expect(isUrlAttribute("class")).toBe(false);
      expect(isUrlAttribute("id")).toBe(false);
      expect(isUrlAttribute("alt")).toBe(false);
    });
  });

  describe("remapAttrName", () => {
    it("rewrites camelCase names to their HTML form", () => {
      expect(remapAttrName("className")).toBe("class");
      expect(remapAttrName("htmlFor")).toBe("for");
      expect(remapAttrName("tabIndex")).toBe("tabindex");
      expect(remapAttrName("srcSet")).toBe("srcset");
    });

    it("leaves unmapped names unchanged", () => {
      expect(remapAttrName("class")).toBe("class");
      expect(remapAttrName("id")).toBe("id");
      expect(remapAttrName("data-x")).toBe("data-x");
    });
  });

  describe("isEventHandlerName", () => {
    it("matches on* handlers regardless of case", () => {
      expect(isEventHandlerName("onClick")).toBe(true);
      expect(isEventHandlerName("onclick")).toBe(true);
      expect(isEventHandlerName("onMouseEnter")).toBe(true);
    });

    it("does not match ordinary names", () => {
      expect(isEventHandlerName("on")).toBe(false); // needs a letter after "on"
      expect(isEventHandlerName("on-off")).toBe(false);
      expect(isEventHandlerName("class")).toBe(false);
    });
  });

  describe("isValidAttrName", () => {
    it("accepts clean names", () => {
      expect(isValidAttrName("class")).toBe(true);
      expect(isValidAttrName("data-x")).toBe(true);
      expect(isValidAttrName("xlink:href")).toBe(true);
    });

    it("rejects names with whitespace, quotes, or =", () => {
      expect(isValidAttrName("a b")).toBe(false);
      expect(isValidAttrName('a"b')).toBe(false);
      expect(isValidAttrName("a=b")).toBe(false);
    });
  });

  describe("RUNTIME_SOURCE", () => {
    it("is the @vincle/core jsx-runtime path (matches Preact/Hono convention)", () => {
      expect(RUNTIME_SOURCE).toBe("@vincle/core/jsx-runtime");
    });
  });

  describe("shared primitives (imported from @vincle/core/html)", () => {
    it("VOID_ELEMENTS matches expected HTML void elements", () => {
      expect(VOID_ELEMENTS.has("br")).toBe(true);
      expect(VOID_ELEMENTS.has("img")).toBe(true);
      expect(VOID_ELEMENTS.has("input")).toBe(true);
      expect(VOID_ELEMENTS.has("div")).toBe(false);
      expect(VOID_ELEMENTS.has("span")).toBe(false);
    });

    it("URL_ATTRIBUTES matches expected URL-bearing attributes", () => {
      expect(URL_ATTRIBUTES.has("href")).toBe(true);
      expect(URL_ATTRIBUTES.has("src")).toBe(true);
      expect(URL_ATTRIBUTES.has("srcset")).toBe(true);
      expect(URL_ATTRIBUTES.has("class")).toBe(false);
    });

    it("ATTRIBUTE_NAME_MAP maps camelCase JSX attrs to HTML", () => {
      expect(ATTRIBUTE_NAME_MAP.get("className")).toBe("class");
      expect(ATTRIBUTE_NAME_MAP.get("htmlFor")).toBe("for");
      expect(ATTRIBUTE_NAME_MAP.get("tabIndex")).toBe("tabindex");
      expect(ATTRIBUTE_NAME_MAP.get("unknownProp")).toBeUndefined();
    });

    it('escapeAttr escapes & < > " identically to the runtime', () => {
      expect(escapeAttr('a"b')).toBe("a&quot;b");
      expect(escapeAttr("a&b<c>d")).toBe("a&amp;b&lt;c&gt;d");
    });

    it("isValidAttrName matches the runtime's validation", () => {
      expect(isValidAttrName("class")).toBe(true);
      expect(isValidAttrName("data-x")).toBe(true);
      expect(isValidAttrName("a b")).toBe(false);
      expect(isValidAttrName('a"b')).toBe(false);
    });

    // Regression guard for the bundler: the `./html` subpath is a pure
    // re-export barrel. The previous bundler (bunup/Bun splitting) emitted a
    // broken module that re-exported names it never imported, so every symbol
    // resolved to `undefined` at runtime — invisible to tests that read the
    // source via tsconfig paths. This imports the *published* entry point
    // (resolved to dist through the package `exports` map) and asserts every
    // named export is actually wired up.
    it("the published html-primitives barrel exports every symbol (not undefined)", async () => {
      const barrel = await import("@vincle/core/html");
      expect(barrel.VOID_ELEMENTS).toBeInstanceOf(Set);
      expect(barrel.URL_ATTRIBUTES).toBeInstanceOf(Set);
      expect(barrel.ATTRIBUTE_NAME_MAP).toBeInstanceOf(Map);
      expect(typeof barrel.escapeAttr).toBe("function");
      expect(typeof barrel.isValidAttrName).toBe("function");
      expect(typeof barrel.isValidTagName).toBe("function");
    });
  });
});
