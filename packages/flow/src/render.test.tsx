import type { VNode } from "@vincle/core";

import { describe, it, expect } from "bun:test";

import type { FlowContext } from "./context.js";
import type { FlowEvent } from "./types.js";

import { NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { Style } from "./components/assets.js";
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
              <Template target="content">
                <span>content</span>
              </Template>
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
          <Template target="inner">{InnerContent()}</Template>
        </section>
      );
    };
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Template target="outer">{Outer()}</Template>
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
      yield (<li>a</li>) as VNode;
      await Bun.sleep(50);
      yield (<li>b</li>) as VNode;
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
              <Template target="x">
                <span>x</span>
              </Template>
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
                <Template target="content">
                  <span>content</span>
                </Template>
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
          <Template target="inner">{InnerContent()}</Template>
        </section>
      );
    };
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="outer">{Inner()}</Template>
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
              <Template target="d">
                <span>d</span>
              </Template>
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
      yield (<li>g</li>) as VNode;
    }
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Template target="d">
                <span>d</span>
              </Template>
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

/**
 * The shell is a page, not a payload.
 *
 * Everything below asserts on *timing*, not just on final bytes: a buffered
 * implementation passes any test that only checks the concatenated output. The
 * question these ask is whether the `<head>` reaches the client while a slow
 * component in the `<body>` is still pending.
 */
describe("shell streaming", () => {
  const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  };

  it("emits the head before a slow body component settles", async () => {
    const g = gate();
    const Slow = async () => {
      await g.promise;
      return <p>late</p>;
    };

    const reader = renderToFlowEvents(
      () => (
        <html>
          <head>
            <title>T</title>
          </head>
          <body>
            <Slow />
          </body>
        </html>
      ),
      TurboAdapter,
    ).getReader();

    const first = await reader.read();
    expect(first.value).toEqual({
      type: "shell",
      html: "<html><head><title>T</title></head><body>",
    });

    g.open();
    const rest: FlowEvent[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      rest.push(next.value);
    }
    expect(rest.map((e) => e.html).join("")).toBe("<p>late</p></body></html>");
  });

  it("splits the shell into one event per suspension, and no more", async () => {
    const Slow = async (props: { n: number }) => <i>{props.n}</i>;
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <p>a</p>
              <Slow n={1} />
              <p>b</p>
              <Slow n={2} />
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.filter((e) => e.type === "shell").map((e) => e.html)).toEqual([
      "<html><body><p>a</p>",
      "<i>1</i><p>b</p>",
      "<i>2</i>",
    ]);
  });

  it("a fully synchronous shell is still a single event", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <p>sync</p>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.filter((e) => e.type === "shell")).toHaveLength(1);
  });

  it("the closing tag is still split off, whichever chunk it lands in", async () => {
    const Slow = async () => <p>x</p>;
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Slow />
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(events.at(-1)).toEqual({ type: "close", html: "</body></html>" });
    expect(events.map((e) => e.html).join("")).toBe("<html><body><p>x</p></body></html>");
  });

  it("streamed bytes are identical to the buffered ones", async () => {
    const Slow = async (props: { n: number }) => <li>{props.n}</li>;
    const page = () => (
      <html>
        <head>
          <title>Same</title>
        </head>
        <body>
          <ul>
            <Slow n={1} />
            <Slow n={2} />
          </ul>
        </body>
      </html>
    );
    const streamed = await collect(renderToStream(page, TurboAdapter));
    const buffered = await renderShell(page, {}, FAKE_CTX);
    expect(streamed).toBe(buffered.shellBody + "\n" + buffered.closingTag + "\n");
  });

  /**
   * `withPolyfill` decides from `ctx.templateStore.size`, which is only final
   * once the body has rendered — it cannot be applied to a prefix. Declaring a
   * `transformShell` is therefore an opt-out, and it has to stay an opt-out:
   * streaming such an adapter would silently drop its transform.
   */
  it("an adapter with transformShell buffers instead, and keeps its transform", async () => {
    const Slow = async () => <p>late</p>;
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <head></head>
            <body>
              <Slow />
              <Template target="d">
                <span>d</span>
              </Template>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );
    const shells = events.filter((e) => e.type === "shell");
    expect(shells).toHaveLength(1);
    expect(shells[0]!.html).toContain("MutationObserver");
  });

  /**
   * Asset markers are emitted by a single `raw()` node, so they land in the
   * pending buffer whole and a chunk boundary can never fall inside one. This
   * pins that invariant: break it and the marker leaks into the HTML verbatim.
   */
  it("resolves asset markers that sit between two suspension points", async () => {
    const Slow = async () => <p>late</p>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Style name="t">{"body{color:red}"}</Style>
            </head>
            <body>
              <Slow />
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<style data-name="t">body{color:red}</style>');
    expect(html).not.toContain("vincle:style");
  });
});
