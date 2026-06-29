import { renderAttributes, renderStyle } from "./render-attributes.js";
import { expect, describe, it, spyOn } from "bun:test";

describe("renderAttributes", () => {
  it("treats all-lowercase non-event attribute names as plain attributes", () => {
    const result = renderAttributes({ onclick: 42, id: "btn" });
    expect(result).not.toContain("onclick");
    expect(result).toContain('id="btn"');
  });

  it("detects event handlers only when attribute starts with 'on'", () => {
    expect(renderAttributes({ only: "plain" })).toBe(' only="plain"');
  });

  it("drops internal props via computeAttrMeta", () => {
    expect(renderAttributes({ key: "secret", ref: "el" })).toBe("");
  });
  it("renders class and className as separate attributes (no merge)", () => {
    expect(renderAttributes({ class: "a", className: "b" })).toBe(
      ' class="a" class="b"',
    );
  });

  it("handles className alone", () => {
    expect(renderAttributes({ className: "only-class" })).toBe(
      ' class="only-class"',
    );
  });

  it("handles boolean attributes", () => {
    expect(renderAttributes({ disabled: true, checked: false })).toBe(
      " disabled",
    );
  });

  it("handles style objects", () => {
    expect(
      renderAttributes({ style: { color: "red", marginTop: "10px" } }),
    ).toBe(' style="color:red;margin-top:10px"');
  });

  it("handles style as raw string", () => {
    expect(renderAttributes({ style: "color: red; margin-top: 10px;" })).toBe(
      ' style="color: red; margin-top: 10px;"',
    );
  });

  it("blocks unsafe URLs", () => {
    expect(renderAttributes({ href: "javascript:alert(1)" })).toBe(
      ' href="#blocked"',
    );
  });

  it("allows safe data: image URLs", () => {
    expect(renderAttributes({ src: "data:image/png;base64,abc" })).toBe(
      ' src="data:image/png;base64,abc"',
    );
  });

  it("supports string event handlers and block non-string values", () => {
    expect(
      renderAttributes({
        onClick: "alert('hello')",
        onHover: () => {},
        id: "btn",
      }),
    ).toBe(' onclick="alert(&#39;hello&#39;)" id="btn"');
  });

  it("supports custom event handler with template literals", () => {
    expect(
      renderAttributes({
        onclick: "alert(`Hello ${this.dataset.name}`)",
        "data-name": "World",
      }),
    ).toBe(' onclick="alert(`Hello ${this.dataset.name}`)" data-name="World"');
  });

  it("ignores internal props", () => {
    expect(renderAttributes({ key: "1", ref: "r", id: "ok" })).toBe(' id="ok"');
  });

  it("ignores null and undefined values", () => {
    expect(renderAttributes({ id: "ok", foo: null, bar: undefined })).toBe(
      ' id="ok"',
    );
  });

  it("passes through data-* and aria-* attributes verbatim", () => {
    expect(
      renderAttributes({ "data-test-id": "123", "aria-label": "test" }),
    ).toBe(' data-test-id="123" aria-label="test"');
  });

  it("passes through unknown attributes verbatim regardless of casing", () => {
    expect(renderAttributes({ dataTestId: "123", ariaLabel: "test" })).toBe(
      ' dataTestId="123" ariaLabel="test"',
    );
  });

  it("blocks function values on lowercase event handlers (regression)", () => {
    expect(
      renderAttributes({
        onclick: () => {},
        onfocus: () => {},
        ONCLICK: () => {},
        id: "btn",
      }),
    ).toBe(' id="btn"');
  });

  it("blocks non-string values on lowercase event handlers (regression)", () => {
    expect(
      renderAttributes({
        onclick: 42,
        onmouseover: true,
        onkeydown: { handler: "x" },
        id: "btn",
      }),
    ).toBe(' id="btn"');
  });

  it("strips invisible Unicode chars from attribute names (regression)", () => {
    expect(renderAttributes({ "data​-id": "123" })).toBe(' data-id="123"');
    expect(renderAttributes({ "cla‎ss": "x" })).toBe(' class="x"');
    expect(renderAttributes({ "id\x00": "v" })).toBe(' id="v"');
  });

  it("resolves a direct Promise in an attribute", async () => {
    const result = await renderAttributes({
      // @ts-expect-error — title is typed string, not Awaitable; runtime resolves Promise-valued attrs
      title: Promise.resolve("async title"),
    });
    expect(result).toBe(' title="async title"');
  });

  it("handles mixed sync/async in same props object", async () => {
    const result = await renderAttributes({
      id: "static",
      // @ts-expect-error — title is typed string, not Awaitable; runtime resolves Promise-valued attrs
      title: Promise.resolve("async-title"),
      class: "static-class",
    });
    expect(result).toContain('id="static"');
    expect(result).toContain('class="static-class"');
    expect(result).toContain('title="async-title"');
  });

  it("enforces URL safety on a Promise-valued URL attribute", async () => {
    const result = await renderAttributes({
      href: Promise.resolve("javascript:alert(1)"),
    });
    expect(result).toBe(' href="#blocked"');
  });

  it("accepts a Promise<CSSProperties> as style", async () => {
    const result = await renderAttributes({
      style: Promise.resolve({ color: "red", marginTop: "4px" }),
    });
    expect(result).toBe(' style="color:red;margin-top:4px"');
  });

  it("warns only once per attribute name for function event handlers", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < 3; i++) {
        expect(renderAttributes({ onPointerCancel: () => {}, id: "btn" })).toBe(
          ' id="btn"',
        );
      }
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("onPointerCancel");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("renderStyle", () => {
  it("converts camelCase to kebab-case", () => {
    expect(renderStyle({ backgroundColor: "red", "--custom": "blue" })).toBe(
      "background-color:red;--custom:blue",
    );
  });

  it("preserves CSS custom properties with uppercase letters verbatim", () => {
    expect(renderStyle({ "--myVar": "10px" })).toBe("--myVar:10px");
  });

  it("converts multi-capital camelCase to kebab-case", () => {
    expect(
      renderStyle({
        borderTopColor: "red",
        borderTopLeftRadius: "4px",
        listStyleType: "disc",
        textDecorationLine: "underline",
      }),
    ).toBe(
      "border-top-color:red;border-top-left-radius:4px;list-style-type:disc;text-decoration-line:underline",
    );
  });
});

describe("renderAttribute — ATTRIBUTE_NAME_MAP coverage", () => {
  it("maps every camelCase React prop to its HTML equivalent", () => {
    const result: string = renderAttributes({
      htmlFor: "field",
      acceptCharset: "utf-8",
      httpEquiv: "content-type",
      tabIndex: 1,
      readOnly: true,
      maxLength: 10,
      minLength: 2,
      autoFocus: true,
      autoPlay: true,
      autoComplete: "on",
      encType: "multipart/form-data",
      noValidate: true,
      dateTime: "2025-01-01",
      srcSet: "small.jpg 320w, large.jpg 1024w",
    }) as string;
    expect(result).toContain('for="field"');
    expect(result).toContain('accept-charset="utf-8"');
    expect(result).toContain('http-equiv="content-type"');
    expect(result).toContain('tabindex="1"');
    expect(result).toContain("readonly");
    expect(result).toContain('maxlength="10"');
    expect(result).toContain('minlength="2"');
    expect(result).toContain("autofocus");
    expect(result).toContain("autoplay");
    expect(result).toContain('autocomplete="on"');
    expect(result).toContain('enctype="multipart/form-data"');
    expect(result).toContain("novalidate");
    expect(result).toContain('datetime="2025-01-01"');
    expect(result).toContain('srcset="small.jpg 320w, large.jpg 1024w"');
  });

  it("maps SVG camelCase props to their HTML equivalents", () => {
    expect(renderAttributes({ xlinkHref: "#icon" })).toBe(
      ' xlink:href="#icon"',
    );
    expect(
      renderAttributes({ xmlnsXlink: "http://www.w3.org/1999/xlink" }),
    ).toBe(' xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(renderAttributes({ xmlLang: "en" })).toBe(' xml:lang="en"');
    expect(renderAttributes({ xmlBase: "http://example.com" })).toBe(
      ' xml:base="http://example.com"',
    );
    expect(renderAttributes({ xmlSpace: "preserve" })).toBe(
      ' xml:space="preserve"',
    );
  });
});

describe("renderAttribute — regex edge cases", () => {
  it("does not treat non-leading 'on' as event handler", () => {
    expect(renderAttributes({ only: "plain", xonclick: "x" })).toBe(
      ' only="plain" xonclick="x"',
    );
  });

  it("blocks javascript: in uppercase URL attribute", () => {
    expect(renderAttributes({ HREF: "javascript:alert(1)" })).toBe(
      ' HREF="#blocked"',
    );
  });

  it("blocks javascript: in uppercase SrcSet attribute", () => {
    expect(renderAttributes({ SRCSET: "javascript:alert(1)" })).toBe(
      ' SRCSET="#blocked"',
    );
  });
});

describe("renderAttribute — remaining mutation kills", () => {
  it("drops boolean value on attribute containing 'on' after first char (kills REGEX_EVENT_HANDLER anchor)", () => {
    expect(renderAttributes({ oFoonclick: true })).toBe(" oFoonclick");
  });
});
