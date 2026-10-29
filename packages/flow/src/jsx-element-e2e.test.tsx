import { describe, it, expect } from "bun:test";

import { NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { renderToStatic, renderToStream, Defer, Slot } from "./index.js";
import { collect } from "./test-utils.js";

// `JSX.Element` is an alias of `Renderable`, the contract users annotate their
// components with. These tests pass values that only the wide union allows
// (text, numbers, arrays, promises) through Flow's public surfaces and check
// the rendered bytes: a type-level acceptance that breaks the wire is not the
// contract.

describe("JSX.Element = Renderable, end to end", () => {
  it("renderPage renders every Renderable shape in order, escaped", async () => {
    const html = await renderToStatic(async (ctx) =>
      ctx.renderPage(() => ["a & b", 42, null, Promise.resolve(<em>ok</em>)]),
    );
    expect(html).toBe("a &amp; b42<em>ok</em>");
  });

  it("renders Defer fallbacks from the wide union", async () => {
    const html = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <body>
              <Defer target="n" fallback={42}>
                <span>real</span>
              </Defer>
              <Defer target="l" fallback={["Loading ", <strong>slow</strong>]}>
                <span>real</span>
              </Defer>
            </body>
          </html>
        )),
      { adapter: NativeAdapter },
    );
    expect(html).toContain("42");
    expect(html).toContain("Loading <strong>slow</strong>");
  });

  it("renders Slot children from the wide union", async () => {
    const html = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <body>
              <Slot name="count">{["Count: ", 3]}</Slot>
            </body>
          </html>
        )),
      { adapter: NativeAdapter },
    );
    expect(html).toContain("Count: 3");
  });

  it("streams wide fragment values and stream chunks, escaped and in order", async () => {
    async function* chunks() {
      yield "a & b";
      yield 7;
    }
    const wire = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="n">{async () => 42}</Defer>
              <Defer target="s">{chunks()}</Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(wire).toContain("42");
    expect(wire).toContain("a &amp; b");
    expect(wire.indexOf("a &amp; b")).toBeLessThan(wire.indexOf("</html>"));
    expect(wire.indexOf(">7<")).toBeGreaterThan(-1);
  });

  it("renders an onError string fallback, escaped", async () => {
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(String(args[0]));
    try {
      const wire = await collect(
        renderToStream(
          () => (
            <html>
              <body>
                <Defer target="boom" onError={() => "Oops & sorry"}>
                  {() => {
                    throw new Error("boom");
                  }}
                </Defer>
              </body>
            </html>
          ),
          TurboAdapter,
        ),
      );
      expect(wire).toContain("Oops &amp; sorry");
    } finally {
      console.error = original;
    }
  });
});
