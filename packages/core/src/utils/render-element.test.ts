import { RawString } from "../core/types.js";
import { renderElement } from "./render-element.js";
import { expect, describe, it, spyOn } from "bun:test";

describe("renderElement — tag name validation", () => {
  it("renders valid HTML tags", () => {
    expect((renderElement("div", {}, []) as RawString).value).toBe(
      "<div></div>",
    );
  });

  it("renders custom elements with hyphens", () => {
    expect((renderElement("my-component", {}, []) as RawString).value).toBe(
      "<my-component></my-component>",
    );
  });

  it("blocks tag names with spaces", () => {
    expect(
      (renderElement('div class="injected"', {}, []) as RawString).value,
    ).toBe("");
  });

  it("blocks tag names starting with a digit", () => {
    expect((renderElement("1div", {}, []) as RawString).value).toBe("");
  });

  it("blocks tag names with angle brackets", () => {
    expect((renderElement("<script>", {}, []) as RawString).value).toBe("");
  });

  it("warns only once per invalid tag name", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < 3; i++) {
        expect((renderElement("7bad", {}, []) as RawString).value).toBe("");
      }
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("7bad");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("supports nested renderElement", () => {
    expect(
      (renderElement("div", {}, [renderElement("span", {}, [])]) as RawString)
        .value,
    ).toBe("<div><span></span></div>");
  });
});

describe("renderElement — content rendering", () => {
  it("renders string children", () => {
    const result = renderElement("p", {}, "hello") as RawString;
    expect(result.value).toBe("<p>hello</p>");
  });

  it("escapes string children", () => {
    const result = renderElement("p", {}, "<script>") as RawString;
    expect(result.value).toBe("<p>&lt;script&gt;</p>");
  });

  it("renders empty children array as empty element", () => {
    const result = renderElement("div", {}, []) as RawString;
    expect(result.value).toBe("<div></div>");
  });

  it("renders number 0 as content (falsy but renderable)", () => {
    const result = renderElement(
      "span",
      {},
      0 as unknown as string,
    ) as RawString;
    expect(result.value).toBe("<span>0</span>");
  });

  it("passes RawString children verbatim (no double-escape)", () => {
    const raw = new RawString("<em>trusted</em>");
    const result = renderElement(
      "div",
      {},
      raw as unknown as string,
    ) as RawString;
    expect(result.value).toBe("<div><em>trusted</em></div>");
  });

  it("renders multiple children via array", () => {
    const result = renderElement("ul", {}, [
      renderElement("li", {}, "a"),
      renderElement("li", {}, "b"),
    ] as unknown as string) as RawString;
    expect(result.value).toBe("<ul><li>a</li><li>b</li></ul>");
  });
});

describe("renderElement — dangerouslySetInnerHTML", () => {
  it("renders sync __html content", () => {
    const result = renderElement(
      "div",
      {
        dangerouslySetInnerHTML: { __html: "<b>safe</b>" },
      },
      [],
    ) as RawString;
    expect(result.value).toBe("<div><b>safe</b></div>");
  });

  it("treats null __html as empty", () => {
    const result = renderElement(
      "div",
      {
        dangerouslySetInnerHTML: { __html: null },
      },
      [],
    ) as RawString;
    expect(result.value).toBe("<div></div>");
  });

  it("treats undefined __html as empty", () => {
    const result = renderElement(
      "div",
      {
        dangerouslySetInnerHTML: { __html: undefined },
      },
      [],
    ) as RawString;
    expect(result.value).toBe("<div></div>");
  });

  it("resolves Promise __html", async () => {
    const result = renderElement(
      "div",
      {
        dangerouslySetInnerHTML: { __html: Promise.resolve("<b>async</b>") },
      },
      [],
    ) as Promise<RawString>;
    expect((await result).value).toBe("<div><b>async</b></div>");
  });

  it("resolves Promise __html that resolves to null as empty", async () => {
    const result = renderElement(
      "div",
      {
        dangerouslySetInnerHTML: { __html: Promise.resolve(null) },
      },
      [],
    ) as Promise<RawString>;
    expect((await result).value).toBe("<div></div>");
  });
});

describe("renderElement — void elements", () => {
  it("renders <img> without closing tag", () => {
    const result = renderElement("img", { src: "a.png" }, []) as RawString;
    expect(result.value).toBe('<img src="a.png">');
  });

  it("renders <br> without closing tag", () => {
    const result = renderElement("br", {}, []) as RawString;
    expect(result.value).toBe("<br>");
  });

  it("renders <input> without closing tag", () => {
    const result = renderElement("input", { type: "text" }, []) as RawString;
    expect(result.value).toBe('<input type="text">');
  });
});

describe("renderElement — rawtext elements (explicit breakout prevention)", () => {
  it("escapes </script> in script element content (nested <script> left alone)", () => {
    const result = renderElement(
      "script",
      {},
      "</script><script>alert(1)",
    ) as RawString;
    expect(result.value).toBe("<script><\\/script><script>alert(1)</script>");
  });

  it("escapes </script> but leaves <!-- and <script> in rawtext content", () => {
    const result = renderElement(
      "script",
      {},
      "<!--<script>alert(1)</script>",
    ) as RawString;
    expect(result.value).toBe(
      "<script><!--<script>alert(1)<\\/script></script>",
    );
    expect(result.value.match(/<\/script>/g)).toHaveLength(1);
  });

  it("escapes </style> in style element content", () => {
    const result = renderElement(
      "style",
      {},
      "</style><img src=x onerror=alert(1)>",
    ) as RawString;
    expect(result.value).toBe(
      "<style><\\/style><img src=x onerror=alert(1)></style>",
    );
  });

  it("preserves normal JS in script elements", () => {
    const result = renderElement(
      "script",
      {},
      "console.log('hello');",
    ) as RawString;
    expect(result.value).toBe("<script>console.log('hello');</script>");
  });

  it("preserves JS with comparison operators (no rawtext breakout issue)", () => {
    const result = renderElement(
      "script",
      {},
      "if (a < 5 && b > 3) { run(); }",
    ) as RawString;
    expect(result.value).toBe(
      "<script>if (a < 5 && b > 3) { run(); }</script>",
    );
  });

  it("does not escape non-closing-tag angle brackets in script", () => {
    const result = renderElement("script", {}, "a < b") as RawString;
    expect(result.value).toBe("<script>a < b</script>");
  });

  it("passes RawString through verbatim in script elements", () => {
    const raw = new RawString("alert(1)");
    const result = renderElement(
      "script",
      {},
      raw as unknown as string,
    ) as RawString;
    expect(result.value).toBe("<script>alert(1)</script>");
  });

  it("escapes </SCRIPT> case-insensitively in script elements", () => {
    const result = renderElement("script", {}, "</SCRIPT>") as RawString;
    expect(result.value).toBe("<script><\\/SCRIPT></script>");
  });

  it("renders number 0 in script elements", () => {
    const result = renderElement(
      "script",
      {},
      0 as unknown as string,
    ) as RawString;
    expect(result.value).toBe("<script>0</script>");
  });

  it("normalizes <SCRIPT> (uppercase) to lowercase for rawtext detection", () => {
    const result = renderElement(
      "SCRIPT",
      {},
      "</SCRIPT><script>alert(1)",
    ) as RawString;
    // tag.toLowerCase() normalizes "SCRIPT" → "script" → RAWTEXT_TAGS matches
    // → escapeRawText escapes </SCRIPT> → <\/SCRIPT>
    expect(result.value).toBe("<SCRIPT><\\/SCRIPT><script>alert(1)</SCRIPT>");
  });

  it("normalizes <Script> (mixed case) for rawtext detection", () => {
    const result = renderElement("Script", {}, "</Script>") as RawString;
    expect(result.value).toBe("<Script><\\/Script></Script>");
  });
});

describe("renderElement — RCDATA elements (textarea, title)", () => {
  it("escapes < via entities in textarea content (RCDATA-safe)", () => {
    const result = renderElement(
      "textarea",
      {},
      "</textarea><img src=x onerror=alert(1)>",
    ) as RawString;
    // escapeContent is used: < → &lt; and > → &gt;
    expect(result.value).toBe(
      "<textarea>&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;</textarea>",
    );
  });

  it("escapes < via entities in title content (RCDATA-safe)", () => {
    const result = renderElement(
      "title",
      {},
      "</title><script>alert(1)",
    ) as RawString;
    expect(result.value).toBe(
      "<title>&lt;/title&gt;&lt;script&gt;alert(1)</title>",
    );
  });
});

describe("renderElement — async paths", () => {
  it("returns a Promise when children contain a Promise", async () => {
    const result = renderElement(
      "span",
      {},
      Promise.resolve("dynamic") as unknown as string,
    );
    expect(result).toBeInstanceOf(Promise);
    expect(((await result) as RawString).value).toBe("<span>dynamic</span>");
  });

  it("returns a Promise when an attribute value is a Promise", async () => {
    const result = renderElement(
      "div",
      {
        class: Promise.resolve("async-class"),
      },
      [],
    );
    expect(result).toBeInstanceOf(Promise);
    expect(((await result) as RawString).value).toBe(
      '<div class="async-class"></div>',
    );
  });

  it("handles mixed sync attrs + async children", async () => {
    const result = renderElement(
      "p",
      { id: "x" },
      Promise.resolve("hello") as unknown as string,
    );
    expect(result).toBeInstanceOf(Promise);
    expect(((await result) as RawString).value).toBe('<p id="x">hello</p>');
  });
});
