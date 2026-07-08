import { Flow, initFlow } from "../context.js";
import { Defer, Fill, Slot } from "../index.js";
import { TurboAdapter, NativeAdapter } from "../adapters/index.js";
import { renderStream } from "../render.js";
import { collect } from "../test-utils.js";
import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

describe("Defer", () => {
  it("renders a placeholder and registers content (streaming mode)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Defer>{() => <span>content</span>}</Defer>,
      );
      expect(html).toContain('id="fragment-1"');
      const { pendingStore } = useContext(Flow);
      expect(pendingStore.size).toBe(1);
    });
  });

  it("accepts a factory returning a node", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Defer>{() => <span>inline</span>}</Defer>,
      );
      expect(html).toContain('id="fragment-1"');
      const { pendingStore } = useContext(Flow);
      expect(pendingStore.size).toBe(1);
    });
  });

  it("honours an explicit name", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(<Defer name="cart">{() => <span>x</span>}</Defer>);
      const entries = useContext(Flow).pendingStore.pending(new Set());
      expect(entries.find(([id]) => id === "cart")).toBeDefined();
    });
  });

  it("stores an explicit merge type", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(
        <Defer name="list" merge="append">
          {() => <li>item</li>}
        </Defer>,
      );
      const entries = useContext(Flow).pendingStore.pending(new Set());
      expect(entries.find(([id]) => id === "list")?.[1].merge).toBe("append");
    });
  });

  it("accepts plain JSX children (no thunk needed)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Defer>
          <span>plain</span>
        </Defer>,
      );
      expect(html).toContain('id="fragment-1"');
      const { pendingStore } = useContext(Flow);
      expect(pendingStore.size).toBe(1);
    });
  });

  it("generates a src in static mode", async () => {
    await withScope(async () => {
      initFlow({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      const html = await renderToString(
        <Defer>{() => <span>content</span>}</Defer>,
      );
      expect(html).toContain('src="/f/fragment-1.html"');
    });
  });
});

describe("Defer — streaming sequences (async-iterable child)", () => {
  it("streams each yield as an append fragment", async () => {
    async function* rows() {
      yield <li>a</li>;
      yield <li>b</li>;
    }
    const html = await collect(
      renderStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Fill target="feed" merge="append">
                {() => rows()}
              </Fill>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
    expect((html.match(/target="feed"/g) ?? []).length).toBe(2);
    expect(html).toContain('action="append"');
  });

  it("streams even with no other deferred content present", async () => {
    async function* rows() {
      yield <li>only</li>;
    }
    const html = await collect(
      renderStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Fill target="feed" merge="append">
                {() => rows()}
              </Fill>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>only</li>");
    expect(html).toContain("</html>");
  });

  it("a streaming Defer registered inside a one-shot Defer factory is picked up", async () => {
    async function* inner() {
      yield <li>streamed</li>;
    }
    const html = await collect(
      renderStream(
        () => (
          <html>
            <body>
              <Defer>
                {() => (
                  <div>
                    deferred
                    <Fill target="feed" merge="append">
                      {() => inner()}
                    </Fill>
                  </div>
                )}
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("streamed");
    expect(html).toContain("deferred");
  });
});

describe("edge cases — Defer", () => {
  it("NativeAdapter escapes a hostile id in the processing instruction", async () => {
    const html = await collect(
      renderStream(
        () => (
          <html>
            <body>
              <Slot name={'x"><script>alert(1)</script>'} />
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });
});
