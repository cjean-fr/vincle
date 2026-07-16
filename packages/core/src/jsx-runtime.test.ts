import { describe, it, expect, spyOn } from "bun:test";

import type { VNode } from "./index.js";

import { renderToString, raw, Fragment } from "./index.js";
import { jsx, jsxDEV, jsxAttr, jsxTemplate, createElement } from "./jsx-runtime.js";
import { renderAttr } from "./render-attrs.js";

describe("jsx — intrinsic elements", () => {
  it("renders a simple element", async () => {
    const el = jsx("div", { children: "hello" });
    expect(await renderToString(el)).toBe("<div>hello</div>");
  });

  it("renders element with attributes", async () => {
    const el = jsx("a", { href: "/about", class: "link", children: "About" });
    expect(await renderToString(el)).toBe('<a href="/about" class="link">About</a>');
  });

  it("renders boolean attribute as bare name", async () => {
    const el = jsx("input", { disabled: true });
    expect(await renderToString(el)).toBe("<input disabled>");
  });

  it("skips false/null/undefined attribute values", async () => {
    const el = jsx("div", { id: undefined, class: null, hidden: false });
    expect(await renderToString(el)).toBe("<div></div>");
  });

  it("maps className to class", async () => {
    const el = jsx("div", { className: "foo" });
    expect(await renderToString(el)).toBe('<div class="foo"></div>');
  });

  it("maps htmlFor to for", async () => {
    const el = jsx("label", { htmlFor: "input-id", children: "Label" });
    expect(await renderToString(el)).toBe('<label for="input-id">Label</label>');
  });

  it("renders style object as inline CSS", async () => {
    const el = jsx("div", {
      style: { color: "red", marginTop: "10px" },
    });
    expect(await renderToString(el)).toBe('<div style="color:red;margin-top:10px"></div>');
  });

  it("renders style string verbatim", async () => {
    const el = jsx("div", { style: "color: red;" });
    expect(await renderToString(el)).toBe('<div style="color: red;"></div>');
  });

  it("skips nullish style values", async () => {
    const el = jsx("div", {
      style: { color: "red", marginTop: undefined as any },
    });
    expect(await renderToString(el)).toBe('<div style="color:red"></div>');
  });

  it("escapes string children", async () => {
    const el = jsx("p", { children: "<script>alert(1)</script>" });
    expect(await renderToString(el)).toBe("<p>&lt;script>alert(1)&lt;/script></p>");
  });

  it("preserves CSS custom properties in style", async () => {
    const el = jsx("div", { style: { "--my-var": "10px" } });
    expect(await renderToString(el)).toBe('<div style="--my-var:10px"></div>');
  });

  it("renders multiple children via array", async () => {
    const el = jsx("ul", {
      children: [jsx("li", { children: "a" }), jsx("li", { children: "b" })],
    });
    expect(await renderToString(el)).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("renders uppercase event handler name", async () => {
    const el = jsx("button", {
      onClick: "alert(1)",
      children: "Click",
    });
    expect(await renderToString(el)).toBe('<button onclick="alert(1)">Click</button>');
  });

  it("drops function event handlers with warning", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = jsx("button", {
        onToggle: () => {},
        children: "Click",
      });
      expect(await renderToString(el)).toBe("<button>Click</button>");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("onToggle");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("blocks javascript: URLs", async () => {
    const el = jsx("a", { href: "javascript:alert(1)", children: "link" });
    expect(await renderToString(el)).toBe('<a href="#blocked">link</a>');
  });

  it("allows safe data: image URIs", async () => {
    const el = jsx("img", { src: "data:image/png;base64,abc" });
    expect(await renderToString(el)).toBe('<img src="data:image/png;base64,abc">');
  });

  it("renders void elements without closing tag", async () => {
    const el = jsx("br", {});
    expect(await renderToString(el)).toBe("<br>");
    const img = jsx("img", { src: "a.png" });
    expect(await renderToString(img)).toBe('<img src="a.png">');
  });

  it("maps SVG camelCase attrs", async () => {
    const el = jsx("use", { xlinkHref: "#icon" });
    expect(await renderToString(el)).toBe('<use xlink:href="#icon"></use>');
  });

  it("accepts data-* and aria-* attributes", async () => {
    const el = jsx("div", { "data-test-id": "123", "aria-label": "test" });
    expect(await renderToString(el)).toBe('<div data-test-id="123" aria-label="test"></div>');
  });
});

describe("jsx — async elements", () => {
  it("renders element with Promise child", async () => {
    const el = jsx("div", { children: Promise.resolve("async") });
    expect(await renderToString(el)).toBe("<div>async</div>");
  });

  it("renders element with Promise attribute", async () => {
    const el = jsx("div", {
      class: Promise.resolve("async-class"),
    });
    expect(await renderToString(el)).toBe('<div class="async-class"></div>');
  });

  it("handles mixed sync attrs + async children", async () => {
    const el = jsx("p", {
      id: "x",
      children: Promise.resolve("hello"),
    });
    expect(await renderToString(el)).toBe('<p id="x">hello</p>');
  });

  it("enforces URL safety on Promise-valued URL attr", async () => {
    const el = jsx("a", {
      href: Promise.resolve("javascript:alert(1)"),
      children: "x",
    });
    expect(await renderToString(el)).toBe('<a href="#blocked">x</a>');
  });
});

describe("jsx — components", () => {
  it("renders a functional component", async () => {
    const Button = ({ label }: { label: string }) => jsx("button", { children: label });
    const el = jsx(Button, { label: "Click" });
    expect(await renderToString(el)).toBe("<button>Click</button>");
  });

  it("renders nested components", async () => {
    const Box = ({ children }: { children?: any }) => jsx("div", { class: "box", children });
    const App = () => jsx(Box, { children: jsx("p", { children: "Hello" }) });
    expect(await renderToString(jsx(App, {}))).toBe('<div class="box"><p>Hello</p></div>');
  });

  it("renders async component", async () => {
    const AsyncComp = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return raw("<div>Async</div>");
    };
    const html = await renderToString(jsx(AsyncComp as any, {}));
    expect(html).toBe("<div>Async</div>");
  });

  it("renders async component returning Fragment", async () => {
    const AsyncList: any = async () => {
      await Promise.resolve();
      return [jsx("li", { children: "1" }), jsx("li", { children: "2" })];
    };
    expect(await renderToString(jsx(AsyncList, {}))).toBe("<li>1</li><li>2</li>");
  });

  it("error annotation with component name", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    try {
      await renderToString(jsx(Boom, {}));
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Boom] fail");
    }
  });

  it("preserves original error properties", async () => {
    class HttpError extends Error {
      status: number;
      constructor(status: number) {
        super("boom");
        this.status = status;
      }
    }
    const Boom = () => {
      throw new HttpError(503);
    };
    try {
      await renderToString(jsx(Boom, {}));
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
    }
  });
});

describe("Fragment", () => {
  it("renders fragment children", async () => {
    const el = jsx(Fragment, {
      children: [jsx("li", { children: "1" }), jsx("li", { children: "2" })],
    });
    expect(await renderToString(el)).toBe("<li>1</li><li>2</li>");
  });

  it("fragment inside fragment", async () => {
    const el = jsx(Fragment, {
      children: jsx(Fragment, { children: "deep" }),
    });
    expect(await renderToString(el)).toBe("deep");
  });
});

describe("jsxDEV", () => {
  it("ignores dev-specific parameters", async () => {
    const source = { fileName: "Layout.tsx", lineNumber: 18, columnNumber: 9 };
    const el = jsxDEV(
      "script",
      { type: "module", src: "/assets/client.js" },
      undefined,
      false,
      source,
      null,
    );
    expect(await renderToString(el)).toBe(
      '<script type="module" src="/assets/client.js"></script>',
    );
  });

  it("reads children from props.children", async () => {
    const el = jsxDEV("div", { children: "hello" });
    expect(await renderToString(el)).toBe("<div>hello</div>");
  });
});

describe("dangerouslySetInnerHTML", () => {
  it("renders inner HTML verbatim", async () => {
    const el = jsx("div", {
      dangerouslySetInnerHTML: { __html: "<b>safe</b>" },
    });
    expect(await renderToString(el)).toBe("<div><b>safe</b></div>");
  });

  it("handles null/undefined __html as empty", async () => {
    const el1 = jsx("div", {
      dangerouslySetInnerHTML: { __html: null as any },
    });
    expect(await renderToString(el1)).toBe("<div></div>");
    const el2 = jsx("div", {
      dangerouslySetInnerHTML: { __html: undefined },
    });
    expect(await renderToString(el2)).toBe("<div></div>");
  });

  it("resolves Promise __html", async () => {
    const el = jsx("div", {
      // @ts-ignore
      dangerouslySetInnerHTML: { __html: Promise.resolve("<b>async</b>") },
    });
    expect(await renderToString(el)).toBe("<div><b>async</b></div>");
  });

  it("handles Promise __html that resolves to null", async () => {
    const el = jsx("div", {
      // @ts-ignore
      dangerouslySetInnerHTML: { __html: Promise.resolve(null) },
    });
    expect(await renderToString(el)).toBe("<div></div>");
  });
});

describe("rawtext elements (script, style)", () => {
  it("escapes </script> in script element", async () => {
    const el = jsx("script", {
      children: "</script><script>alert(1)",
    });
    expect(await renderToString(el)).toBe("<script><\\/script><script>alert(1)</script>");
  });

  it("escapes </style> in style element", async () => {
    const el = jsx("style", {
      children: "</style><img src=x onerror=alert(1)>",
    });
    expect(await renderToString(el)).toBe("<style><\\/style><img src=x onerror=alert(1)></style>");
  });

  it("preserves normal JS in script element", async () => {
    const el = jsx("script", { children: "console.log('hello');" });
    expect(await renderToString(el)).toBe("<script>console.log('hello');</script>");
  });

  it("escapes </SCRIPT> case-insensitively", async () => {
    const el = jsx("script", { children: "</SCRIPT>" });
    expect(await renderToString(el)).toBe("<script><\\/SCRIPT></script>");
  });
});

describe("RCDATA elements (textarea, title)", () => {
  it("escapes via entities in textarea", async () => {
    const el = jsx("textarea", {
      children: "</textarea><img src=x onerror=alert(1)>",
    });
    expect(await renderToString(el)).toBe(
      "<textarea>&lt;/textarea>&lt;img src=x onerror=alert(1)></textarea>",
    );
  });

  it("escapes via entities in title", async () => {
    const el = jsx("title", {
      children: "</title><script>alert(1)",
    });
    expect(await renderToString(el)).toBe("<title>&lt;/title>&lt;script>alert(1)</title>");
  });
});

describe("Invalid tag names", () => {
  it("throws on a tag that could break out of the markup (eager, at jsx() time)", () => {
    expect(() => jsx('div onclick="x"' as any, {})).toThrow("Invalid tag name");
    expect(() => jsx("<script>" as any, {})).toThrow("Invalid tag name");
    expect(() => jsx("img/onerror=x" as any, {})).toThrow("Invalid tag name");
  });

  it("accepts namespaced / underscore tags (blocklist, not whitelist)", async () => {
    expect(await renderToString(jsx("svg:rect" as any, { children: "x" }))).toBe(
      "<svg:rect>x</svg:rect>",
    );
    expect(await renderToString(jsx("foo_bar" as any, { children: "y" }))).toBe(
      "<foo_bar>y</foo_bar>",
    );
  });
});

describe("Precompile path — jsxTemplate", () => {
  it("renders static template", () => {
    const result = jsxTemplate(["<h1>hello</h1>"]);
    expect(result.toString()).toBe("<h1>hello</h1>");
  });

  it("interpolates dynamic text", () => {
    const result = jsxTemplate(["<h1>Hello ", "!</h1>"], "Ada");
    expect(result.toString()).toBe("<h1>Hello Ada!</h1>");
  });

  it("interpolates nested element", () => {
    const child = jsx("span", { children: "x" });
    const result = jsxTemplate(["<div>", "</div>"], child);
    expect(result.toString()).toBe("<div><span>x</span></div>");
  });

  it("escapes unsafe content", () => {
    const result = jsxTemplate(["<div>", "</div>"], "<script>alert(1)</script>");
    expect(result.toString()).toBe("<div>&lt;script>alert(1)&lt;/script></div>");
  });

  it("filters null/undefined/boolean", () => {
    const result = jsxTemplate(["<div>", "</div>"], [null, undefined, false, true]);
    expect(result.toString()).toBe("<div></div>");
  });

  it("renders concurrent promises in parallel", async () => {
    const start = Date.now();
    const slow = (v: string, ms: number) => new Promise<string>((r) => setTimeout(() => r(v), ms));
    const result = jsxTemplate(["<p>", " - ", "</p>"], slow("a", 30), slow("b", 20));
    expect((await result).toString()).toBe("<p>a - b</p>");
    expect(Date.now() - start).toBeLessThan(45);
  });
});

describe("Precompile path — jsxAttr", () => {
  it("renders attribute key=value", () => {
    const result = jsxTemplate(["<a ", "></a>"], jsxAttr("href", "/about"));
    expect(result.toString()).toBe('<a href="/about"></a>');
  });

  it("skips false/null/undefined attrs", () => {
    const out = jsxTemplate(
      ["<div ", " ", "></div>"],
      jsxAttr("id", undefined),
      jsxAttr("checked", false),
    );
    expect(out.toString()).toBe("<div  ></div>");
  });

  it("escapes quotes in attribute values", () => {
    const result = jsxTemplate(["<a ", "></a>"], jsxAttr("title", '"><script>x</script>'));
    expect(result.toString()).toBe('<a title="&quot;>&lt;script>x&lt;/script>"></a>');
  });

  it("filters function event handlers but accepts strings", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const ok = jsxTemplate(["<button ", "></button>"], jsxAttr("onClick", "alert(1)"));
      expect(ok.toString()).toBe('<button onclick="alert(1)"></button>');

      const dropped = jsxTemplate(
        ["<button ", "></button>"],
        jsxAttr("onClick", () => {}),
      );
      expect(dropped.toString()).toBe("<button ></button>");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Precompile path — async", () => {
  it("resolves Promise attr", async () => {
    const attrPromise = jsxAttr("href", Promise.resolve("/about"));
    const result = jsxTemplate(["<a ", ">x</a>"], attrPromise);
    expect((await result).toString()).toBe('<a href="/about">x</a>');
  });
});

describe("renderAttr (singular)", () => {
  it("returns name=value for string values", () => {
    expect(renderAttr("id", "main")).toBe('id="main"');
  });

  it("returns bare name for boolean true", () => {
    expect(renderAttr("disabled", true)).toBe("disabled");
  });

  it("returns empty string for false/null/undefined", () => {
    expect(renderAttr("disabled", false)).toBe("");
    expect(renderAttr("id", null)).toBe("");
    expect(renderAttr("id", undefined)).toBe("");
  });

  it("maps className to class", () => {
    expect(renderAttr("className", "foo")).toBe('class="foo"');
  });

  it("blocks javascript: URLs", () => {
    expect(renderAttr("href", "javascript:alert(1)")).toBe('href="#blocked"');
  });

  it("drops RawString-valued event handlers silently", () => {
    expect(renderAttr("onclick", raw("alert(1)"))).toBe("");
    expect(renderAttr("onmouseover", raw("x"))).toBe("");
  });

  it("renders RawString-valued non-event attributes", () => {
    expect(renderAttr("class", raw("foo"))).toBe('class="foo"');
    expect(renderAttr("id", raw("main"))).toBe('id="main"');
  });

  it("skips function-valued event handlers silently", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(renderAttr("onclick", () => {})).toBe("");
      expect(renderAttr("ondblclick", function () {})).toBe("");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("preserves string-valued event handlers", () => {
    expect(renderAttr("onclick", "alert(1)")).toBe('onclick="alert(1)"');
    expect(renderAttr("onsubmit", "return false")).toBe('onsubmit="return false"');
  });

  it("accepts data-* and aria-* attributes", () => {
    expect(renderAttr("data-testid", "main")).toBe('data-testid="main"');
    expect(renderAttr("aria-label", "close")).toBe('aria-label="close"');
  });
});

describe("createElement — classic-runtime compat (tsc key-after-spread fallback)", () => {
  it("renders an intrinsic element with a single child", async () => {
    const el = createElement("div", { class: "c" }, "hi");
    expect(await renderToString(el)).toBe('<div class="c">hi</div>');
  });

  it("folds multiple trailing children into props.children", async () => {
    const el = createElement("ul", null, "a", "b", "c");
    expect(await renderToString(el)).toBe("<ul>abc</ul>");
  });

  it("drops key/ref (never inlined, never seen by a component)", async () => {
    // The exact shape TypeScript emits for `<div {...p} key="k">t</div>`.
    const el = createElement("div", { ...{ id: "x" }, key: "k", ref: "r" }, "t");
    expect(await renderToString(el)).toBe('<div id="x">t</div>');

    let seenKey: unknown = "unset";
    function Probe(props: { key?: unknown; children?: unknown }): VNode {
      seenKey = props.key;
      return jsx("span", { children: props.children });
    }
    await renderToString(createElement(Probe, { key: "k" }, "child"));
    expect(seenKey).toBeUndefined();
  });

  it("escapes child text exactly like the automatic runtime", async () => {
    const via = await renderToString(createElement("p", null, "a & b <x>"));
    const auto = await renderToString(jsx("p", { children: "a & b <x>" }));
    expect(via).toBe(auto);
    expect(via).toBe("<p>a &amp; b &lt;x></p>");
  });
});
