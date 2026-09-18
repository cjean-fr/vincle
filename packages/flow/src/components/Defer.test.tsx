import type { VNode } from "@vincle/core";

import { Scope } from "@vincle/core";
import { raw, renderToString } from "@vincle/core";
import { describe, expect, it } from "bun:test";

import type { FlowEvent } from "../types.js";

import { NativeAdapter, TurboAdapter } from "../adapters/index.js";
import { initFlow } from "../context.js";
import { Defer, Slot, renderToStatic } from "../index.js";
import { renderToFlowEvents, renderToStream } from "../render.js";
import { collect, collectEvents } from "../test-utils.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Defer — deferred content (placeholder always)", () => {
  it("generates distinct targets and patches each matching placeholder", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <>
            <Defer fallback={<p>Loading first…</p>}>
              <p>First result</p>
            </Defer>
            <Defer fallback={<p>Loading second…</p>}>{async () => <p>Second result</p>}</Defer>
          </>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="fragment-1"><p>Loading first…</p>');
    expect(html).toContain('<turbo-frame id="fragment-2"><p>Loading second…</p>');
    expect(html).toContain('target="fragment-1"><template><p>First result</p>');
    expect(html).toContain('target="fragment-2"><template><p>Second result</p>');
  });

  it("renders a placeholder, then patches in sync content with the given merge", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="toast-list" merge="append">
                <li>Notification</li>
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="toast-list">');
    expect(html).toContain('action="append"');
    expect(html).toContain('target="toast-list"');
    expect(html).toContain("Notification");
  });

  it("renders a placeholder for async component content, then patches it in once it resolves", async () => {
    const AsyncContent = async () => <span>content</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="content">
                <AsyncContent />
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="content">');
    expect(html).toContain('target="content"');
    expect(html).toContain("content");
  });

  it("accepts custom placeholder content", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="profile" fallback={<div class="skeleton">Loading...</div>}>
                {async () => {
                  await sleep(10);
                  return <div>Profile Data</div>;
                }}
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<div class="skeleton">Loading...</div>');
    expect(html).toContain("Profile Data");
  });

  it("accepts a promise returning a node, and patches it in once it resolves", async () => {
    const AsyncContent = async () => <span>inline</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="inline">
                <AsyncContent />
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="inline">');
    expect(html).toContain("inline");
  });

  it("honours an explicit target", async () => {
    const AsyncContent = async () => <span>x</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="cart">
                <AsyncContent />
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="cart">');
    expect(html).toContain('target="cart"');
  });

  it("stores an explicit merge type", async () => {
    const AsyncContent = async () => <li>item</li>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="list" merge="append">
                <AsyncContent />
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('action="append"');
    expect(html).toContain('target="list"');
  });

  it("registers plain JSX content and renders a placeholder", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="plain">
                <span>plain</span>
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="plain">');
    expect(html).toContain("plain");
  });

  it("generates a src in static mode", async () => {
    await Scope.with(async () => {
      initFlow({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      const AsyncContent = async () => <span>content</span>;
      const html = await renderToString(
        <Defer target="content">
          <AsyncContent />
        </Defer>,
      );
      expect(html).toContain('src="/f/content.html"');
    });
  });
});

describe("Defer — streaming sequences (async-iterable child)", () => {
  it("streams each yield as an append fragment", async () => {
    async function* rows() {
      yield (<li>a</li>) as VNode;
      yield (<li>b</li>) as VNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Defer target="feed" merge="append">
                {rows()}
              </Defer>
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
      yield (<li>only</li>) as VNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Defer target="feed" merge="append">
                {rows()}
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>only</li>");
    expect(html).toContain("</html>");
  });

  it("a streaming Defer registered inside a one-shot async Defer is picked up", async () => {
    async function* inner() {
      yield (<li>streamed</li>) as VNode;
    }
    const Outer = () => (
      <div>
        deferred
        <Defer target="feed" merge="append">
          {inner()}
        </Defer>
      </div>
    );
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Defer target="deferred">
                <Outer />
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

describe("a string DeferContent is text, not markup", () => {
  const emit = async (content: unknown) => {
    let body = "";
    await renderToStatic(
      async (ctx) => {
        await ctx.renderPage(() => (
          <html>
            <body>
              <Defer target="t">{content as never}</Defer>
            </body>
          </html>
        ));
        await ctx.emitFragments((_id, _url, html) => void (body = html));
      },
      { adapter: TurboAdapter },
    );
    return body;
  };

  it("escapes a plain string", async () => {
    expect(await emit("<b>hi</b>")).toBe('<turbo-frame id="t">&lt;b&gt;hi&lt;/b&gt;</turbo-frame>');
  });

  it("passes it through when wrapped in raw()", async () => {
    expect(await emit(raw("<b>hi</b>"))).toBe('<turbo-frame id="t"><b>hi</b></turbo-frame>');
  });
});

describe("Defer.Sequence / Defer.Together", () => {
  it("sequential (default): reveals in DOM order even when later item finishes first", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <Defer.Sequence>
            <Defer target="slow">
              {async () => {
                await sleep(40);
                return <div>Slow content</div>;
              }}
            </Defer>
            <Defer target="fast">
              {async () => {
                await sleep(10);
                return <div>Fast content</div>;
              }}
            </Defer>
          </Defer.Sequence>
        ),
        TurboAdapter,
      ),
    );

    const fragments = events.filter(
      (e): e is Extract<FlowEvent, { type: "fragment" }> => e.type === "fragment",
    );
    expect(fragments).toHaveLength(2);
    // Even though "fast" finished at 10ms and "slow" at 40ms, "slow" emitted first!
    expect(fragments[0]!.id).toBe("slow");
    expect(fragments[1]!.id).toBe("fast");
    expect(fragments[0]!.html).toContain("Slow content");
    expect(fragments[1]!.html).toContain("Fast content");
  });

  it("together={true}: buffers all until all items in group are ready", async () => {
    const emittedTimestamps: Record<string, number> = {};
    const startTime = Date.now();

    const stream = renderToFlowEvents(
      () => (
        <Defer.Together>
          <Defer target="fast">
            {async () => {
              await sleep(15);
              return <div>Fast</div>;
            }}
          </Defer>
          <Defer target="slow">
            {async () => {
              await sleep(50);
              return <div>Slow</div>;
            }}
          </Defer>
        </Defer.Together>
      ),
      TurboAdapter,
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "fragment") {
        emittedTimestamps[value.id] = Date.now() - startTime;
      }
    }

    expect(emittedTimestamps["fast"]).toBeDefined();
    expect(emittedTimestamps["slow"]).toBeDefined();
    // Fast finished at 15ms, but was only emitted around 50ms together with slow
    expect(emittedTimestamps["fast"]!).toBeGreaterThanOrEqual(40);
    expect(Math.abs(emittedTimestamps["fast"]! - emittedTimestamps["slow"]!)).toBeLessThan(15);
  });

  it("nested Defer.Sequence: coordinates hierarchical groups", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <Defer.Sequence>
            <Defer target="hero">
              {async () => {
                await sleep(40);
                return <div>Hero</div>;
              }}
            </Defer>
            <Defer.Together>
              <Defer target="col-a">
                {async () => {
                  await sleep(10);
                  return <div>Col A</div>;
                }}
              </Defer>
              <Defer target="col-b">
                {async () => {
                  await sleep(20);
                  return <div>Col B</div>;
                }}
              </Defer>
            </Defer.Together>
            <Defer target="footer">
              {async () => {
                await sleep(5);
                return <div>Footer</div>;
              }}
            </Defer>
          </Defer.Sequence>
        ),
        TurboAdapter,
      ),
    );

    const fragments = events.filter(
      (e): e is Extract<FlowEvent, { type: "fragment" }> => e.type === "fragment",
    );
    expect(fragments).toHaveLength(4);
    // Order must be: hero first, then inner together (col-a, col-b), then footer
    expect(fragments[0]!.id).toBe("hero");
    const middleIds = [fragments[1]!.id, fragments[2]!.id];
    expect(middleIds).toContain("col-a");
    expect(middleIds).toContain("col-b");
    expect(fragments[3]!.id).toBe("footer");
  });

  it("sequential order: error in first item unblocks subsequent items", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <Defer.Sequence>
            <Defer target="failing" onError={() => <div>Error UI</div>}>
              {async () => {
                await sleep(10);
                throw new Error("Boom");
              }}
            </Defer>
            <Defer target="next">
              {async () => {
                await sleep(20);
                return <div>Next OK</div>;
              }}
            </Defer>
          </Defer.Sequence>
        ),
        TurboAdapter,
      ),
    );

    const fragments = events.filter(
      (e): e is Extract<FlowEvent, { type: "fragment" }> => e.type === "fragment",
    );
    expect(fragments).toHaveLength(2);
    expect(fragments[0]!.id).toBe("failing");
    expect(fragments[0]!.html).toContain("Error UI");
    expect(fragments[1]!.id).toBe("next");
    expect(fragments[1]!.html).toContain("Next OK");
  });

  it("sequential order: error with void onError unblocks subsequent items (no deadlock)", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <Defer.Sequence>
            <Defer
              target="silent-fail"
              onError={() => {
                /* void, no UI */
              }}
            >
              {async () => {
                await sleep(10);
                throw new Error("Silent");
              }}
            </Defer>
            <Defer target="good">
              {async () => {
                await sleep(20);
                return <div>Good</div>;
              }}
            </Defer>
          </Defer.Sequence>
        ),
        TurboAdapter,
      ),
    );

    const fragments = events.filter(
      (e): e is Extract<FlowEvent, { type: "fragment" }> => e.type === "fragment",
    );
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.id).toBe("good");
    expect(fragments[0]!.html).toContain("Good");
  });

  it("streaming Defer (AsyncIterable) in a Defer.Sequence: unblocks after first yield", async () => {
    async function* liveFeed() {
      yield (<li>Feed 1</li>) as VNode;
      await sleep(30);
      yield (<li>Feed 2</li>) as VNode;
    }

    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <Defer.Sequence>
            <Defer target="header">
              {async () => {
                await sleep(15);
                return <h1>Header</h1>;
              }}
            </Defer>
            <Defer target="feed" merge="append">
              {liveFeed()}
            </Defer>
            <Defer target="footer">
              {async () => {
                await sleep(10);
                return <footer>Footer</footer>;
              }}
            </Defer>
          </Defer.Sequence>
        ),
        TurboAdapter,
      ),
    );

    const fragments = events.filter(
      (e): e is Extract<FlowEvent, { type: "fragment" }> => e.type === "fragment",
    );
    expect(fragments.length).toBe(4);
    // Header emits first
    expect(fragments[0]!.id).toBe("header");
    // Feed 1 emits next
    expect(fragments[1]!.id).toBe("feed");
    expect(fragments[1]!.html).toContain("Feed 1");
    // Footer emits next (not blocked by Feed 2!)
    expect(fragments[2]!.id).toBe("footer");
    // Feed 2 emits when it arrives
    expect(fragments[3]!.id).toBe("feed");
    expect(fragments[3]!.html).toContain("Feed 2");
  });
});
