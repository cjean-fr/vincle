import type { VNode, ResolvedVNode } from "@vincle/core";

import { describe, it, expect } from "bun:test";

import type { FlowContext } from "./context.js";
import type { FlowEvent } from "./types.js";

import { NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { renderToStream, Template } from "./index.js";
import { renderToFlowEvents, renderShell, runSequence } from "./render.js";
import { collectEvents, collect, type FragmentEvent } from "./test-utils.js";

// renderShell only reads ctx through adapter.transformShell; these unit tests
// pass a stub with no pending fragments.
const FAKE_CTX = { templateStore: { size: 0 } } as unknown as FlowContext;

describe("renderToFlowEvents", () => {
  it("emits shell + close when there is nothing deferred", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <p>static</p>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["shell", "close"]);
  });

  it("emits shell, then fragment, then close", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Template target="content"><span>content</span></Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["shell", "fragment", "close"]);
  });

  it("streams a synchronously-nested Template after its parent", async () => {
    const InnerContent = async () => <span>INNER-SYNC</span>;
    const Outer = async () => {
      await Promise.resolve();
      return (
        <section>
          OUTER
          <Template target="inner"><InnerContent /></Template>
        </section>
      );
    };
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Template target="outer"><Outer /></Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    const fragments = events.filter((e): e is FragmentEvent => e.type === "fragment");
    expect(fragments.map((p) => p.id)).toEqual(["outer", "inner"]);
  });

  it("propagates an external AbortSignal — stream closes after it fires", async () => {
    const ac = new AbortController();
    const stream = renderToFlowEvents(
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      TurboAdapter,
      { signal: ac.signal },
    );
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.value?.type).toBe("shell");
    ac.abort();
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
  });

  it("cancels a stream mid-flight between fragments", async () => {
    const ac = new AbortController();
    async function* items(): AsyncGenerator<VNode, void, undefined> {
      yield (<li>a</li>) as ResolvedVNode;
      await Bun.sleep(50);
      yield (<li>b</li>) as ResolvedVNode;
    }
    const stream = renderToFlowEvents(
      () => (
        <html>
          <body>
            <ul id="feed" />
            <Template target="feed" merge="append">
              {items()}
            </Template>
          </body>
        </html>
      ),
      TurboAdapter,
      { signal: ac.signal },
    );
    const reader = stream.getReader();
    await reader.read(); // shell
    expect((await reader.read()).value?.type).toBe("fragment");
    ac.abort();
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
  });
});

describe("renderShell", () => {
  it("strips </body></html> and returns them as closingTag", async () => {
    const { shellBody, closingTag } = await renderShell(
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      {},
      FAKE_CTX,
    );
    expect(shellBody).not.toContain("</body>");
    expect(shellBody).not.toContain("</html>");
    expect(closingTag).toMatch(/<\/body>\s*<\/html>\s*$/i);
  });

  it("returns an empty closingTag when there are no closing tags", async () => {
    const { shellBody, closingTag } = await renderShell(() => <p>no wrapping</p>, {}, FAKE_CTX);
    expect(shellBody).toContain("<p>no wrapping</p>");
    expect(closingTag).toBe("");
  });

  it("applies adapter.transformShell to the shell body", async () => {
    const { shellBody } = await renderShell(
      () => (
        <html>
          <body />
        </html>
      ),
      { transformShell: (s: string) => s + "<!-- transformed -->" },
      FAKE_CTX,
    );
    expect(shellBody).toContain("<!-- transformed -->");
  });
});

describe("runSequence", () => {
  it("emits shell, then runs flushTemplates, then emits close in full mode", async () => {
    const events: FlowEvent[] = [];
    const emit = async (ev: FlowEvent) => void events.push(ev);
    const ac = new AbortController();
    await runSequence(
      emit,
      ac.signal,
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      TurboAdapter,
      {},
    );
    expect(events.map((e) => e.type)).toEqual(["shell", "close"]);
  });

  it("skips shell and close in fragment mode", async () => {
    const events: FlowEvent[] = [];
    const emit = async (ev: FlowEvent) => void events.push(ev);
    const ac = new AbortController();
    await runSequence(
      emit,
      ac.signal,
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      TurboAdapter,
      { mode: "fragment" },
    );
    expect(events).toEqual([]);
  });

  it("emits nothing when the signal is already aborted", async () => {
    const events: FlowEvent[] = [];
    const emit = async (ev: FlowEvent) => void events.push(ev);
    const ac = new AbortController();
    ac.abort();
    await runSequence(
      emit,
      ac.signal,
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      TurboAdapter,
      {},
    );
    expect(events).toEqual([]);
  });
});

describe("renderToStream", () => {
  it("renders stream with NativeAdapter when passed explicitly", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head></head>
            <body>
              <Template target="x"><span>x</span></Template>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );
    expect(html).toContain("MutationObserver");
    expect(html).toContain("</html>");
  });

  it("sends </html> after fragment chunks", async () => {
    const chunks = (
      await collect(
        renderToStream(
          () => (
            <html>
              <body>
                <Template target="content"><span>content</span></Template>
              </body>
            </html>
          ),
          TurboAdapter,
        ),
      )
    ).toString();
    expect(chunks.indexOf("turbo-stream")).toBeLessThan(chunks.indexOf("</html>"));
  });

  it("streams a Template nested behind an await", async () => {
    const InnerContent = async () => {
      await Promise.resolve();
      return <span>INNER-ASYNC</span>;
    };
    const Inner = async () => {
      await Promise.resolve();
      return (
        <section>
          OUTER
          <Template target="inner"><InnerContent /></Template>
        </section>
      );
    };
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="outer"><Inner /></Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("INNER-ASYNC");
    const parent = html.indexOf('target="outer"');
    const child = html.indexOf('target="inner"');
    expect(parent).toBeGreaterThan(-1);
    expect(parent).toBeLessThan(child);
  });
});

describe("edge cases — render pipeline", () => {
  it("pre-aborted signal → no events, stream closes cleanly", async () => {
    const ac = new AbortController();
    ac.abort();
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <p>hi</p>
            </body>
          </html>
        ),
        TurboAdapter,
        { signal: ac.signal },
      ),
    );
    expect(events).toEqual([]);
  });

  it("transformShell is applied exactly once on the streaming path", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head></head>
            <body>
              <p>hi</p>
              <Template target="d"><span>d</span></Template>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );
    expect((html.match(/MutationObserver/g) ?? []).length).toBe(1);
  });

  it("mixed one-shot + stream: shell first, fragments between, close last", async () => {
    async function* g() {
      yield (<li>g</li>) as ResolvedVNode;
    }
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Template target="d"><span>d</span></Template>
              <Template target="feed" merge="append">
                {g()}
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events[0]!.type).toBe("shell");
    expect(events.at(-1)!.type).toBe("close");
    const types = events.map((e) => e.type);
    const shellIdx = types.indexOf("shell");
    const closeIdx = types.lastIndexOf("close");
    types.forEach((t, i) => {
      if (t === "fragment") {
        expect(i).toBeGreaterThan(shellIdx);
        expect(i).toBeLessThan(closeIdx);
      }
    });
  });
});
