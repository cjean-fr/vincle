import { createPendingStore, type PendingStore } from "./pending-store.js";
import type { FlowConfig } from "./types.js";
import { renderStream, Fill, Defer } from "./index.js";
import { TurboAdapter } from "./adapters/index.js";
import { renderToFlowEvents } from "./render.js";
import { streamFlow } from "./streamFlow.js";
import { collect, collectEvents, type FragmentEvent } from "./test-utils.js";
import type { FlowEvent } from "./types.js";
import { describe, it, expect } from "bun:test";

const drain = async (
  store: PendingStore,
  opts?: Parameters<typeof streamFlow>[2],
) => {
  const results: FlowEvent[] = [];
  await streamFlow(
    { pendingStore: store },
    async (ev) => void results.push(ev),
    opts,
  );
  return results;
};

const cfg: FlowConfig = { adapter: TurboAdapter, mode: "streaming" };

describe("streamFlow", () => {
  it("emits a fragment for a one-shot node entry", async () => {
    const store = createPendingStore(cfg);
    store.defer("t1", { content: () => <div>Hello</div>, merge: "replace" });
    const results = await drain(store);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("fragment");
    if (results[0]!.type === "fragment")
      expect(results[0]!.html).toContain("Hello");
  });

  it("streams each item of an async-iterable entry", async () => {
    async function* rows() {
      yield <li>a</li>;
      yield <li>b</li>;
    }
    const store = createPendingStore(cfg);
    store.defer("feed", { content: () => rows(), merge: "append" });
    const results = await drain(store);
    const fragments = results.filter((e) => e.type === "fragment");
    expect(fragments).toHaveLength(2);
  });

  it("catches a factory throw and continues other entries", async () => {
    const store = createPendingStore(cfg);
    store.defer("good", { content: () => <div>OK</div>, merge: "replace" });
    store.defer("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
    });
    const results = await drain(store);
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment") expect(results[0]!.id).toBe("good");
  });

  it("emits an error fallback fragment when onError returns a node", async () => {
    const store = createPendingStore(cfg);
    store.defer("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
    });
    const results = await drain(store, {
      onError: () => <span>error-fallback</span>,
    });
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment")
      expect(results[0]!.html).toContain("error-fallback");
  });

  it("a per-entry onError overrides the global one", async () => {
    const store = createPendingStore(cfg);
    store.defer("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
      onError: () => <span>local</span>,
    });
    const results = await drain(store, {
      onError: () => <span>global</span>,
    });
    if (results[0]!.type === "fragment")
      expect(results[0]!.html).toContain("local");
  });

  it("aborts a factory that exceeds its timeout and routes to onError", async () => {
    const slow = async (signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 1000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(signal.reason);
          },
          { once: true },
        );
      });
      return <div>too late</div>;
    };
    const store = createPendingStore(cfg);
    store.defer("slow", { content: slow, merge: "replace", timeout: 10 });
    const results = await drain(store, {
      onError: (err) => <span>{(err as Error).message}</span>,
    });
    if (results[0]!.type === "fragment") {
      expect(results[0]!.html).toContain('Defer "slow" timed out after 10ms');
      expect(results[0]!.html).not.toContain("too late");
    }
  });

  it("applies defaultTimeout when a factory sets no timeout of its own", async () => {
    const content = (signal: AbortSignal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ) as unknown as ReturnType<() => any>;
    const store = createPendingStore(cfg);
    store.defer("slow", { content, merge: "replace" });
    const results = await drain(store, {
      defaultTimeout: 10,
      onError: (err) => <span>{(err as Error).message}</span>,
    });
    if (results[0]!.type === "fragment")
      expect(results[0]!.html).toContain("timed out after 10ms");
  });
});

describe("edge cases — streaming", () => {
  it("reader cancel stops an infinite generator", async () => {
    // Use a cooperative generator that yields control so the abort signal
    // can propagate before the next iteration.
    async function* inf(signal: AbortSignal) {
      let i = 0;
      while (!signal.aborted) {
        i++;
        yield <li>{i}</li>;
        await Promise.resolve(); // yield event loop — let abort propagate
      }
    }
    const stream = renderStream(
      () => (
        <html>
          <body>
            <ul id="feed" />
            <Fill target="feed" merge="append">
              {(signal) => inf(signal!)}
            </Fill>
          </body>
        </html>
      ),
      TurboAdapter,
    );
    const reader = stream.getReader();
    await reader.read(); // shell
    await reader.read(); // fragment 1
    await reader.read(); // fragment 2
    await reader.read(); // fragment 3
    await reader.cancel();
    // After cancel, the signal is aborted → generator stops.
    // The reader should be done (no more chunks).
    const last = await reader.read();
    expect(last.done).toBe(true);
  });

  it("backpressure: producer parks while reading is paused, then completes", async () => {
    let produced = 0;
    async function* many() {
      for (let i = 0; i < 100; i++) {
        produced++;
        yield <span>{i}</span>;
      }
    }
    const stream = renderStream(
      () => (
        <html>
          <body>
            <div id="out" />
            <Fill target="out" merge="append">
              {() => many()}
            </Fill>
          </body>
        </html>
      ),
      TurboAdapter,
    );
    const reader = stream.getReader();
    for (let i = 0; i < 10; i++) if ((await reader.read()).done) break;
    await Bun.sleep(20);
    expect(produced).toBeLessThan(50);
    let remaining = 0;
    while (!(await reader.read()).done) remaining++;
    expect(remaining).toBe(92);
    expect(produced).toBe(100);
  });

  it("factory throw with onError → error fragment, good siblings still emit", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => (
          <html>
            <body>
              <Defer>
                {() => {
                  throw new Error("crash");
                }}
              </Defer>
              <Defer>{() => <span>ok</span>}</Defer>
            </body>
          </html>
        ),
        TurboAdapter,
        { onError: () => <div>err-fallback</div> },
      ),
    );
    const fragments = events.filter(
      (e): e is FragmentEvent => e.type === "fragment",
    );
    expect(fragments.find((p) => p.id === "fragment-1")?.html).toContain(
      "err-fallback",
    );
    expect(fragments.find((p) => p.id === "fragment-2")?.html).toContain("ok");
  });

  it("stream throw mid-iteration → onError kind=stream", async () => {
    const errors: Array<{ kind: string }> = [];
    async function* g() {
      yield <span>first</span>;
      throw new Error("mid-crash");
    }
    await collect(
      renderStream(
        () => (
          <html>
            <body>
              <div id="out" />
              <Fill target="out" merge="append">
                {() => g()}
              </Fill>
            </body>
          </html>
        ),
        TurboAdapter,
        {
          onError(_err, info) {
            errors.push(info);
            return <span>recovered</span>;
          },
        },
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("stream");
  });
});


