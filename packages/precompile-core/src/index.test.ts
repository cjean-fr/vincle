import { describe, it, expect } from "bun:test";

import {
  attrMeta,
  collapseJsxWhitespace,
  escapeAttr,
  isLowercaseTag,
  isValidAttrName,
  isVoidElement,
  hasSpreadOrInnerHTML,
  remapAttrName,
  RUNTIME_SOURCE,
  VOID_ELEMENTS,
  URL_ATTRIBUTES,
  resolveAttrName,
} from "./index.js";

describe("precompile-core", () => {
  describe("isLowercaseTag", () => {
    it("returns true for lowercase first char", () => {
      expect(isLowercaseTag("div")).toBe(true);
      expect(isLowercaseTag("span")).toBe(true);
      expect(isLowercaseTag("svg")).toBe(true);
      expect(isLowercaseTag("a")).toBe(true);
    });

    it("returns false for uppercase first char", () => {
      expect(isLowercaseTag("Div")).toBe(false);
      expect(isLowercaseTag("MyComponent")).toBe(false);
      expect(isLowercaseTag("A")).toBe(false);
    });

    it("returns false for non-alpha first char", () => {
      expect(isLowercaseTag("123")).toBe(false);
      expect(isLowercaseTag("")).toBe(false);
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
        hasSpreadOrInnerHTML([{ kind: "attribute" as const, name: "dangerouslySetInnerHTML" }]),
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
      expect(escapeAttr("a&b<c>d")).toBe("a&amp;b&lt;c>d");
    });

    it("does not escape single quotes (runtime uses double-quoted attrs, ' is safe)", () => {
      expect(escapeAttr("a'b")).toBe("a'b");
    });
  });

  describe("URL attribute rule (delegated to core/html attrMeta)", () => {
    it("is true for URL-bearing attributes", () => {
      expect(attrMeta("href").isUrl).toBe(true);
      expect(attrMeta("src").isUrl).toBe(true);
      expect(attrMeta("action").isUrl).toBe(true);
      expect(attrMeta("formaction").isUrl).toBe(true);
      expect(attrMeta("xlink:href").isUrl).toBe(true);
    });

    it("resolves the camelCase JSX form the runtime resolves", () => {
      expect(attrMeta("xlinkHref").isUrl).toBe(true);
      expect(attrMeta("formAction").isUrl).toBe(true);
    });

    it("is false for ordinary attributes", () => {
      expect(attrMeta("class").isUrl).toBe(false);
      expect(attrMeta("id").isUrl).toBe(false);
      expect(attrMeta("alt").isUrl).toBe(false);
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
      expect(URL_ATTRIBUTES.has("action")).toBe(true);
      expect(URL_ATTRIBUTES.has("formaction")).toBe(true);
      expect(URL_ATTRIBUTES.has("xlink:href")).toBe(true);
      expect(URL_ATTRIBUTES.has("class")).toBe(false);
      expect(URL_ATTRIBUTES.has("srcset")).toBe(false);
    });

    it("resolveAttrName maps camelCase JSX attrs to HTML", () => {
      expect(resolveAttrName("className")).toBe("class");
      expect(resolveAttrName("htmlFor")).toBe("for");
      expect(resolveAttrName("tabIndex")).toBe("tabindex");
      expect(resolveAttrName("srcSet")).toBe("srcset");
      expect(resolveAttrName("unknownProp")).toBe("unknownprop");
    });

    it('escapeAttr escapes & < > " identically to the runtime', () => {
      expect(escapeAttr('a"b')).toBe("a&quot;b");
      expect(escapeAttr("a&b<c>d")).toBe("a&amp;b&lt;c>d");
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
      expect(typeof barrel.resolveAttrName).toBe("function");
      expect(typeof barrel.escapeAttr).toBe("function");
      expect(typeof barrel.isValidAttrName).toBe("function");
    });
  });
});
