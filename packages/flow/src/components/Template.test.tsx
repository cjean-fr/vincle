import type { ResolvedVNode } from "@vincle/core";

import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter, NativeAdapter } from "../adapters/index.js";
import { Flow, initFlow } from "../context.js";
import { Template, Slot } from "../index.js";
import { renderToStream } from "../render.js";
import { collect } from "../test-utils.js";

describe("Template — sync content (no placeholder)", () => {
  it("registers sync content without rendering a placeholder", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Template target="toast-list" merge="append">
          <li>Notification</li>
        </Template>,
      );
      expect(html).toBe("");
      const entries = useContext(Flow).templateStore.outstanding(new Set());
      expect(entries.find(([id]) => id === "toast-list")?.[1].merge).toBe("append");
    });
  });
});

describe("Template — lazy content (placeholder)", () => {
  it("renders a placeholder and registers content (streaming mode)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Template target="content">{() => <span>content</span>}</Template>,
      );
      expect(html).toContain('id="content"');
      const { templateStore } = useContext(Flow);
      expect(templateStore.size).toBe(1);
    });
  });

  it("accepts a factory returning a node", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Template target="inline">{() => <span>inline</span>}</Template>,
      );
      expect(html).toContain('id="inline"');
      const { templateStore } = useContext(Flow);
      expect(templateStore.size).toBe(1);
    });
  });

  it("honours an explicit target", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(<Template target="cart">{() => <span>x</span>}</Template>);
      const entries = useContext(Flow).templateStore.outstanding(new Set());
      expect(entries.find(([id]) => id === "cart")).toBeDefined();
    });
  });

  it("stores an explicit merge type", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(
        <Template target="list" merge="append">
          {() => <li>item</li>}
        </Template>,
      );
      const entries = useContext(Flow).templateStore.outstanding(new Set());
      expect(entries.find(([id]) => id === "list")?.[1].merge).toBe("append");
    });
  });

  it("accepts plain JSX children (no thunk needed)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Template target="plain">
          <span>plain</span>
        </Template>,
      );
      expect(html).toBe("");
      const { templateStore } = useContext(Flow);
      expect(templateStore.size).toBe(1);
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
        <Template target="content">{() => <span>content</span>}</Template>,
      );
      expect(html).toContain('src="/f/content.html"');
    });
  });
});

describe("Template — streaming sequences (async-iterable child)", () => {
  it("streams each yield as an append fragment", async () => {
    async function* rows() {
      yield (<li>a</li>) as ResolvedVNode;
      yield (<li>b</li>) as ResolvedVNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Template target="feed" merge="append">
                {() => rows()}
              </Template>
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

  it("streams even with no other template content present", async () => {
    async function* rows() {
      yield (<li>only</li>) as ResolvedVNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Template target="feed" merge="append">
                {() => rows()}
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>only</li>");
    expect(html).toContain("</html>");
  });

  it("a streaming Template registered inside a one-shot Template factory is picked up", async () => {
    async function* inner() {
      yield (<li>streamed</li>) as ResolvedVNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="deferred">
                {() => (
                  <div>
                    deferred
                    <Template target="feed" merge="append">
                      {() => inner()}
                    </Template>
                  </div>
                )}
              </Template>
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

describe("edge cases — Template", () => {
  it("NativeAdapter escapes a hostile id in the processing instruction", async () => {
    const html = await collect(
      renderToStream(
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
    expect(html).toContain("&lt;script>");
  });
});
