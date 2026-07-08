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
  it("rejects renderToString when a sync component throws", async () => {
    const Crash = () => {
      throw new Error("boom");
    };
    await expect(renderToString(<Crash />)).rejects.toThrow("boom");
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

  it("annotates sync error with component name", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    await expect(renderToString(<Boom />)).rejects.toThrow("[Boom] fail");
  });

  it("annotates async error with component name", async () => {
    async function AsyncBoom() {
      await Promise.resolve();
      throw new Error("fail");
    }
    await expect(renderToString(<AsyncBoom />)).rejects.toThrow(
      "[AsyncBoom] fail",
    );
  });

  it("annotates with the innermost component, not the chain above it", async () => {
    const Child = (): never => {
      throw new Error("fail");
    };
    const Parent = () => (
      <div>
        <Child />
      </div>
    );
    await expect(renderToString(<Parent />)).rejects.toThrow("[Child] fail");
  });

  it("preserves the original error type and properties", async () => {
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
      await renderToString(<Boom />);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
      expect((e as Error).message).toBe("[Boom] boom");
    }
  });

  it("annotates a thrown string value", async () => {
    const Crash = () => {
      throw "string-boom";
    };
    try {
      await renderToString(<Crash />);
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Crash] string-boom");
    }
  });

  it("annotates a thrown number value", async () => {
    const Crash = () => {
      throw 42;
    };
    try {
      await renderToString(<Crash />);
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[Crash] 42");
    }
  });

  it("annotates a thrown object with string tag", async () => {
    const Crash = () => {
      throw { code: 500 };
    };
    try {
      await renderToString(<Crash />);
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

describe("renderToString context isolation", () => {
  const ReqId = Main.context<number>("@vincle/core/test:req-id");

  it("inherits parent scope context into each renderToString", async () => {
    const results = await Main.withScope(async () => {
      Main.setContext(ReqId, 42);
      const a = renderToString(
        <span>{(Main.useContext(ReqId) * 2).toString()}</span>,
      );
      const b = renderToString(
        <span>{(Main.useContext(ReqId) + 1).toString()}</span>,
      );
      return Promise.all([a, b]);
    });
    expect(results).toEqual(["<span>84</span>", "<span>43</span>"]);
  });

  it("isolates renders — setContext inside one does not leak to siblings", async () => {
    const results = await Main.withScope(async () => {
      Main.setContext(ReqId, 1);
      function A() {
        Main.setContext(ReqId, 99);
        return <span>{Main.useContext(ReqId)}</span>;
      }
      function B() {
        return <span>{Main.useContext(ReqId)}</span>;
      }
      const a = renderToString(<A />);
      const b = renderToString(<B />);
      return Promise.all([a, b]);
    });
    expect(results).toEqual(["<span>99</span>", "<span>1</span>"]);
  });

  it("works without a parent scope (standalone renderToString)", async () => {
    const html = await renderToString(<span>ok</span>);
    expect(html).toBe("<span>ok</span>");
  });

  it("boundary stack is isolated per renderToString", async () => {
    const results = await Main.withScope(async () => {
      function Boom(): never {
        throw new Error("fail");
      }
      const a = renderToString(
        <Main.ErrorBoundary fallback={() => <p>caught</p>}>
          <Boom />
        </Main.ErrorBoundary>,
      );
      const b = renderToString(<span>hello</span>);
      return Promise.all([a, b]);
    });
    expect(results).toEqual(["<p>caught</p>", "<span>hello</span>"]);
  });
});
