import type { VincleNode } from "./core/types.js";
import * as Main from "./index.js";
import { renderToString } from "./index.js";
import { describe, it, expect } from "bun:test";

describe("Main Entry Point API Contract", () => {
  it("exports core rendering, fragments and trust markers", () => {
    expect(typeof Main.renderToString).toBe("function");
    const r = Main.raw("<b>test</b>");
    expect(r.toString()).toBe("<b>test</b>");
    expect(r).toBeInstanceOf(Object);
    expect(Main.Fragment).toBeDefined();
  });

  it("exports context and isolation APIs", () => {
    expect(typeof Main.withScope).toBe("function");
    expect(typeof Main.snapshot).toBe("function");
    expect(typeof Main.context).toBe("function");
    expect(typeof Main.setContext).toBe("function");
    expect(typeof Main.useContext).toBe("function");
  });

  it("renderToString accepts a RawString directly", async () => {
    expect(await renderToString(Main.raw("<b>bold</b>"))).toBe("<b>bold</b>");
  });

  it("renderToString resolves then unwraps a Promise<RawString>", async () => {
    expect(await renderToString(Promise.resolve(Main.raw("<i>text</i>")))).toBe(
      "<i>text</i>",
    );
  });

  it("strictly encapsulates internal implementation details", () => {
    expect((Main as any).jsx).toBeUndefined();
    expect((Main as any).jsxs).toBeUndefined();
    expect((Main as any).RawString).toBeUndefined();
    expect((Main as any).isRawString).toBeUndefined();
  });
});

describe("Functional & Classless Components", () => {
  it("renders standard functional components", async () => {
    const Button = ({ label }: { label: string }) => <button>{label}</button>;
    expect(await renderToString(<Button label="Click" />)).toBe(
      "<button>Click</button>",
    );
  });

  it("supports deep nesting with sequential children rendering", async () => {
    const Box = ({ children }: { children?: VincleNode }) => (
      <div class="box">{children}</div>
    );
    const App = () => (
      <Box>
        <p>Hello</p>
      </Box>
    );
    expect(await renderToString(<App />)).toBe(
      '<div class="box"><p>Hello</p></div>',
    );
  });

  it("handles components returning Fragments without array leakage or trailing commas", async () => {
    const List = () => (
      <>
        <li>1</li>
        <li>2</li>
      </>
    );
    expect(
      await renderToString(
        <ul>
          <List />
        </ul>,
      ),
    ).toBe("<ul><li>1</li><li>2</li></ul>");
  });
});

describe("Asynchronous Rendering Pipeline", () => {
  it("supports async components with deferred resolution loops", async () => {
    const AsyncComp = async () => {
      await new Promise((r) => setTimeout(r, 2));
      return <div>Async</div>;
    };
    expect(await renderToString(<AsyncComp />)).toBe("<div>Async</div>");
  });

  it("handles async components returning multi-node fragments", async () => {
    const AsyncList = async () => {
      await Promise.resolve();
      return (
        <>
          <li>1</li>
          <li>2</li>
        </>
      );
    };
    expect(await renderToString(<AsyncList />)).toBe("<li>1</li><li>2</li>");
  });

  it("concurrent-resolves interleaved nested promises in the same text body", async () => {
    const element = (
      <div>
        {Promise.resolve("A")} {Promise.resolve("B")}
      </div>
    );
    expect(await renderToString(element)).toBe("<div>A B</div>");
  });
});

describe("Attribute Processing, Hardening & Sanitization", () => {
  it("maps legacy React properties to native lowercased HTML targets", async () => {
    expect(await renderToString(<label htmlFor="id">Label</label>)).toBe(
      '<label for="id">Label</label>',
    );
    expect(await renderToString(<div tabIndex={1} />)).toBe(
      '<div tabindex="1"></div>',
    );
    expect(await renderToString(<input readOnly />)).toBe("<input readonly>");
  });

  it("sanitizes dangerous URL schemas while preserving case-sensitive SVG namespaces", async () => {
    const svg = (
      <svg viewBox="0 0 10 10">
        <use xlinkHref="javascript:alert(1)" />
      </svg>
    );
    expect(await renderToString(svg)).toBe(
      '<svg viewBox="0 0 10 10"><use xlink:href="#blocked"></use></svg>',
    );
  });

  it("allows verified and non-malicious data-URIs inside source descriptors", async () => {
    const img = <img srcSet="data:image/png;base64,abc 1x" />;
    expect(await renderToString(img)).toBe(
      '<img srcset="data:image/png;base64,abc 1x">',
    );
    expect(await renderToString(<img srcSet="javascript:alert(1) 1x" />)).toBe(
      '<img srcset="#blocked">',
    );
    expect(
      await renderToString(
        <img srcSet="https://example.com/img.png 1x, javascript:alert(1) 2x" />,
      ),
    ).toBe('<img srcset="#blocked">');
  });

  it("drops invalid structural attributes like spaces in naming descriptors", async () => {
    // @ts-ignore
    expect(await renderToString(<div {...{ "data foo": "bar" }} />)).toBe(
      "<div></div>",
    );
  });

  it("purges nullish entries out of complex object style specifications", async () => {
    const inlineStyle = {
      color: "red",
      marginTop: undefined,
      marginContent: null,
    };
    // @ts-expect-error — CSSProperties allows undefined but not null; runtime handles both
    expect(await renderToString(<div style={inlineStyle} />)).toBe(
      '<div style="color:red"></div>',
    );
  });

  it("treats empty, undefined or unprovided inner HTML directives gracefully", async () => {
    expect(
      await renderToString(
        <div dangerouslySetInnerHTML={{ __html: undefined }} />,
      ),
    ).toBe("<div></div>");
    expect(
      await renderToString(
        <div dangerouslySetInnerHTML={{ __html: "<b>html</b>" }} />,
      ),
    ).toBe("<div><b>html</b></div>");
  });

  it("safely stringifies abstract types like Symbol and BigInt", async () => {
    expect(
      await renderToString(
        <div>
          {Symbol("test")} {BigInt(123)}
        </div>,
      ),
    ).toBe("<div>Symbol(test) 123</div>");
  });
});

describe("Error propagation", () => {
  it("propagates a sync component throw through jsx()", () => {
    const Crash = () => {
      throw new Error("boom");
    };
    expect(() => renderToString(<Crash />)).toThrow("boom");
  });

  it("rejects renderToString when an async component rejects", async () => {
    const AsyncCrash = async () => {
      await Promise.resolve();
      throw new Error("async-boom");
    };
    await expect(renderToString(<AsyncCrash />)).rejects.toThrow("async-boom");
  });

  it("rejects renderToString when a Promise child rejects", async () => {
    await expect(
      renderToString(<div>{Promise.reject(new Error("child-boom"))}</div>),
    ).rejects.toThrow("child-boom");
  });

  it("annotates sync error with component name", () => {
    const Boom = () => {
      throw new Error("fail");
    };
    expect(() => renderToString(<Boom />)).toThrow("[Boom] fail");
  });

  it("annotates async error with component name", async () => {
    const AsyncBoom = async () => {
      await Promise.resolve();
      throw new Error("fail");
    };
    expect(() => renderToString(<AsyncBoom />)).toThrow("[AsyncBoom] fail");
  });

  it("annotates with the innermost component, not the chain above it", () => {
    const Child = () => {
      throw new Error("fail");
    };
    const Parent = () => (
      <div>
        <Child />
      </div>
    );
    expect(() => renderToString(<Parent />)).toThrow("[Child] fail");
  });

  it("preserves the original error type and properties", () => {
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
      renderToString(<Boom />);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
      expect((e as Error).message).toBe("[Boom] boom");
    }
  });

  it("annotates a thrown string value", () => {
    const Crash = () => {
      throw "string-boom";
    };
    try {
      renderToString(<Crash />);
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Crash] string-boom");
    }
  });

  it("annotates a thrown number value", () => {
    const Crash = () => {
      throw 42;
    };
    try {
      renderToString(<Crash />);
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Crash] 42");
    }
  });

  it("annotates a thrown object with string tag", () => {
    const Crash = () => {
      throw { code: 500 };
    };
    try {
      renderToString(<Crash />);
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Crash] [object Object]");
    }
  });
});

describe("__html Promise", () => {
  it("resolves a Promise __html into rendered HTML", async () => {
    const html = await renderToString(
      <div
        dangerouslySetInnerHTML={{ __html: Promise.resolve("<b>safe</b>") }}
      />,
    );
    expect(html).toBe("<div><b>safe</b></div>");
  });

  it("handles Promise __html that resolves to null", async () => {
    const html = await renderToString(
      <div dangerouslySetInnerHTML={{ __html: Promise.resolve(null) }} />,
    );
    expect(html).toBe("<div></div>");
  });

  it("rejects renderToString when Promise __html rejects", async () => {
    await expect(
      renderToString(
        <div
          dangerouslySetInnerHTML={{
            __html: Promise.reject(new Error("html-boom")),
          }}
        />,
      ),
    ).rejects.toThrow("html-boom");
  });
});

describe("class + className together", () => {
  it("emits both attributes, no merge", async () => {
    const html = await renderToString(
      <div class="a" className="b">
        x
      </div>,
    );
    expect(html).toBe('<div class="a" class="b">x</div>');
  });
});

describe("Iterable & Generator Children", () => {
  it("renders a sync generator", async () => {
    function* items() {
      yield <li>1</li>;
      yield <li>2</li>;
    }
    expect(await renderToString(<ul>{items()}</ul>)).toBe(
      "<ul><li>1</li><li>2</li></ul>",
    );
  });

  it("renders a Set", async () => {
    expect(await renderToString(<div>{new Set(["a", "b"])}</div>)).toBe(
      "<div>ab</div>",
    );
  });

  it("renders Map values()", async () => {
    const m = new Map([
      ["x", 1],
      ["y", 2],
    ]);
    expect(await renderToString(<div>{m.values()}</div>)).toBe("<div>12</div>");
  });

  it("escapes string items from an iterable", async () => {
    expect(await renderToString(<div>{new Set(["<b>"])}</div>)).toBe(
      "<div>&lt;b&gt;</div>",
    );
  });

  it("renders a generator yielding mixed primitives and elements", async () => {
    function* g() {
      yield "x";
      yield 1;
      yield <b>y</b>;
    }
    expect(await renderToString(<p>{g()}</p>)).toBe("<p>x1<b>y</b></p>");
  });

  it("renders an async generator (buffered)", async () => {
    async function* items() {
      yield <li>a</li>;
      await Promise.resolve();
      yield <li>b</li>;
    }
    expect(await renderToString(<ul>{items()}</ul>)).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
  });
});
