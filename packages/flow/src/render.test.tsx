import type { FlowContext } from "./context.js";
import { renderStream, Defer, Fill } from "./index.js";
import { NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { renderToFlowEvents, renderShell, orchestrateFlow } from "./render.js";
import { collectEvents, collect, type FragmentEvent } from "./test-utils.js";
import type { FlowEvent } from "./types.js";
import type { VNode } from "@vincle/core";
import { describe, it, expect } from "bun:test";

// renderShell only reads ctx through adapter.transformShell; these unit tests
// pass a stub with no pending fragments.
const FAKE_CTX = { pendingStore: { size: 0 } } as unknown as FlowContext;

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
              <Defer>{() => <span>content</span>}</Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["shell", "fragment", "close"]);
  });

  it("streams a synchronously-nested Defer after its parent", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Defer>
                {() => (
                  <section>
                    OUTER
                    <Defer>{() => <span>INNER-SYNC</span>}</Defer>
                  </section>
                )}
              </Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    const fragments = events.filter(
      (e): e is FragmentEvent => e.type === "fragment",
    );
    expect(fragments.map((p) => p.id)).toEqual(["fragment-1", "fragment-2"]);
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
      yield <li>a</li>;
      await Bun.sleep(50);
      yield <li>b</li>;
    }
    const stream = renderToFlowEvents(
      () => (
        <html>
          <body>
            <ul id="feed" />
            <Fill target="feed" merge="append">
              {() => items()}
            </Fill>
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
    const { shellBody, closingTag } = await renderShell(
      () => <p>no wrapping</p>,
      {},
      FAKE_CTX,
    );
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

describe("orchestrateFlow", () => {
  it("emits shell, then runs streamFlow, then emits close in full mode", async () => {
    const events: FlowEvent[] = [];
    const emit = async (ev: FlowEvent) => void events.push(ev);
    const ac = new AbortController();
    await orchestrateFlow(
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
    await orchestrateFlow(
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
    await orchestrateFlow(
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

describe("renderStream", () => {
  it("renders stream with NativeAdapter when passed explicitly", async () => {
    const html = await collect(
      renderStream(
        () => (
          <html>
            <head></head>
            <body>
              <Defer>{() => <span>x</span>}</Defer>
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
        renderStream(
          () => (
            <html>
              <body>
                <Defer>{() => <span>content</span>}</Defer>
              </body>
            </html>
          ),
          TurboAdapter,
        ),
      )
    ).toString();
    expect(chunks.indexOf("turbo-stream")).toBeLessThan(
      chunks.indexOf("</html>"),
    );
  });

  it("streams a Defer nested behind an await", async () => {
    const Inner = async () => {
      await Promise.resolve();
      return (
        <section>
          OUTER
          <Defer>{() => <span>INNER-ASYNC</span>}</Defer>
        </section>
      );
    };
    const html = await collect(
      renderStream(
        () => (
          <html>
            <body>
              <Defer>{() => <Inner />}</Defer>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("INNER-ASYNC");
    const parent = html.indexOf('target="fragment-1"');
    const child = html.indexOf('target="fragment-2"');
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
      renderStream(
        () => (
          <html>
            <head></head>
            <body>
              <p>hi</p>
              <Defer>{() => <span>d</span>}</Defer>
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
      yield <li>g</li>;
    }
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Defer>{() => <span>d</span>}</Defer>
              <Fill target="feed" merge="append">
                {() => g()}
              </Fill>
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
