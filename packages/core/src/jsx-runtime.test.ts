import { renderToString } from "./index.js";
import * as JSXDevRuntime from "./jsx-dev-runtime.js";
import { jsxDEV } from "./jsx-dev-runtime.js";
import * as JSXRuntime from "./jsx-runtime.js";
import {
  jsx,
  jsxAttr,
  jsxEscape,
  jsxTemplate,
  Fragment,
} from "./jsx-runtime.js";
import { describe, it, expect } from "bun:test";

describe("JSX Runtime Export Contract", () => {
  it("jsx-runtime should export standard factories (but NOT jsxDEV)", () => {
    expect(typeof JSXRuntime.jsx).toBe("function");
    expect(typeof JSXRuntime.jsxs).toBe("function");
    expect("jsxDEV" in JSXRuntime).toBe(false);
    expect(JSXRuntime.Fragment).toBeDefined();
    expect(typeof JSXRuntime.jsxTemplate).toBe("function");
    expect(typeof JSXRuntime.jsxAttr).toBe("function");
    expect(typeof JSXRuntime.jsxEscape).toBe("function");
  });

  it("jsx-dev-runtime should export jsxDEV", () => {
    expect(typeof JSXDevRuntime.jsxDEV).toBe("function");
    expect(typeof JSXDevRuntime.jsxs).toBe("function");
    expect(JSXDevRuntime.Fragment).toBeDefined();
    expect(typeof JSXDevRuntime.jsxTemplate).toBe("function");
    expect(typeof JSXDevRuntime.jsxAttr).toBe("function");
    expect(typeof JSXDevRuntime.jsxEscape).toBe("function");
  });
});

describe("Automatic JSX Dev Runtime", () => {
  it("ignores key/isStaticChildren/source/self per the spec — never renders them as children", () => {
    const source = { fileName: "Layout.tsx", lineNumber: 18, columnNumber: 9 };
    const el = jsxDEV(
      "script",
      { type: "module", src: "/assets/client.js" },
      undefined,
      false,
      source,
      null,
    );
    expect(el.toString()).toBe(
      '<script type="module" src="/assets/client.js"></script>',
    );
    expect(el.toString()).not.toContain("[object Object]");
  });

  it("reads children from props.children, not from positional args", () => {
    const el = jsxDEV(
      "div",
      { children: "hello" },
      undefined,
      false,
      { fileName: "x", lineNumber: 1, columnNumber: 1 },
      null,
    );
    expect(el.toString()).toBe("<div>hello</div>");
  });
});

describe("Automatic JSX Runtime Factories", () => {
  it("renders an element with children from props", () => {
    expect(jsx("span", { children: "ok" }).toString()).toBe("<span>ok</span>");
  });

  it("renders multiple children passed via props.children array", async () => {
    const element = jsx("div", {
      id: "p",
      children: [
        jsx("span", { children: "1" }),
        jsx("span", { children: "2" }),
      ],
    });
    expect(await renderToString(element)).toBe(
      '<div id="p"><span>1</span><span>2</span></div>',
    );
  });

  it("ignores the third positional argument (it is the JSX `key`, never a child)", async () => {
    // Per the automatic runtime spec, the third arg is `key`. Old versions
    // of this package treated it as a child when `props.children` was
    // absent, silently rendering keys as content.
    const element = jsx("div", { id: "p" }, "some-key");
    expect(await renderToString(element)).toBe('<div id="p"></div>');
  });

  it("collapses nested Fragments structures into flat layout lines", async () => {
    const result = jsx(Fragment, {
      children: [jsx(Fragment, { children: "deep" })],
    });
    expect(await renderToString(result)).toBe("deep");
  });
});

describe("Deno Precompile Target Runtime Pipeline", () => {
  describe("jsxTemplate Core Compilation Mechanics", () => {
    it("maps static chunks lacking dynamic injections", () => {
      expect(jsxTemplate(["<h1>hello</h1>"]).toString()).toBe("<h1>hello</h1>");
    });

    it("properly weaves changing text slices and dynamic arguments together", () => {
      const result = jsxTemplate(["<h1>Hello ", "!</h1>"], jsxEscape("Ada"));
      expect(result.toString()).toBe("<h1>Hello Ada!</h1>");
    });

    it("accepts attributes and inline nested sub-trees into structural nodes", () => {
      const child = jsx("span", { children: "x" });
      const result = jsxTemplate(["<div>", "</div>"], child);
      expect(result.toString()).toBe("<div><span>x</span></div>");
    });
  });

  describe("jsxEscape Injection Sanitization Engine", () => {
    it("screens out raw script tags through thorough character conversion maps", () => {
      const result = jsxTemplate(
        ["<div>", "</div>"],
        jsxEscape("<script>alert(1)</script>"),
      );
      expect(result.toString()).toBe(
        "<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>",
      );
    });

    it("wipes out invalid values like holes or conditions seamlessly", () => {
      const result = jsxTemplate(
        ["<div>", "</div>"],
        jsxEscape([null, undefined, false, true]),
      );
      expect(result.toString()).toBe("<div></div>");
    });
  });

  describe("jsxAttr Property Enforcement Layer", () => {
    it("drops empty configuration properties entirely from the string stream", () => {
      const out = jsxTemplate(
        ["<div ", " ", "></div>"],
        jsxAttr("id", undefined),
        jsxAttr("checked", false),
      );
      expect(out.toString()).toBe("<div  ></div>");
    });

    it("safely double-escapes quote sequences located inside value assignments", () => {
      const result = jsxTemplate(
        ["<a ", "></a>"],
        jsxAttr("title", '"><script>x</script>'),
      );
      expect(result.toString()).toBe(
        '<a title="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"></a>',
      );
    });

    it("filters function types passed to listeners while maintaining string capability", () => {
      const original = console.warn;
      console.warn = () => {}; // Mute standard error trace
      try {
        const ok = jsxTemplate(
          ["<button ", "></button>"],
          jsxAttr("onClick", "alert(1)"),
        );
        expect(ok.toString()).toBe('<button onclick="alert(1)"></button>');

        const dropped = jsxTemplate(
          ["<button ", "></button>"],
          jsxAttr("onClick", () => {}),
        );
        expect(dropped.toString()).toBe("<button ></button>");
      } finally {
        console.warn = original;
      }
    });
  });

  describe("Parallel Execution Loops", () => {
    it("unpacks attribute properties and multi-node subtrees hidden inside pending promises", async () => {
      const attrPromise = jsxAttr("href", Promise.resolve("/about"));
      const result = jsxTemplate(["<a ", ">x</a>"], attrPromise);
      expect(await result).toBeInstanceOf(Object); // RawString container
      expect((await result).toString()).toBe('<a href="/about">x</a>');
    });

    it("drives concurrent tasks simultaneously in a non-blocking map pattern", async () => {
      const start = Date.now();
      const slow = (v: string, ms: number) =>
        new Promise<string>((r) => setTimeout(() => r(v), ms));
      const result = jsxTemplate(
        ["<p>", " - ", "</p>"],
        jsxEscape(slow("a", 30)),
        jsxEscape(slow("b", 20)),
      );

      expect((await result).toString()).toBe("<p>a - b</p>");
      expect(Date.now() - start).toBeLessThan(45); // Verifies parallel execution loop
    });

    it("awaits a Promise nested inside a sub-array instead of stringifying it", async () => {
      // A top-level-only async scan would take the sync path here and render
      // the nested Promise as "[object Promise]".
      const result = jsxTemplate(
        ["<ul>", "</ul>"],
        jsxEscape(["a", [Promise.resolve("b"), "c"]]),
      );
      expect((await result).toString()).toBe("<ul>abc</ul>");
    });
  });
});
