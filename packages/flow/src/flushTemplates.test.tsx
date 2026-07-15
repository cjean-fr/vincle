import type { ResolvedVNode } from "@vincle/core";

import { describe, it, expect } from "bun:test";

import type { FlowConfig } from "./types.js";
import type { FlowEvent } from "./types.js";

import { TurboAdapter } from "./adapters/index.js";
import { flushTemplates } from "./flushTemplates.js";
import { renderToStream, Template } from "./index.js";
import { renderToFlowEvents } from "./render.js";
import { createTemplateStore, type TemplateStore } from "./template-store.js";
import { collect, collectEvents, type FragmentEvent } from "./test-utils.js";

const drain = async (store: TemplateStore, opts?: Parameters<typeof flushTemplates>[2]) => {
  const results: FlowEvent[] = [];
  await flushTemplates({ templateStore: store }, async (ev) => void results.push(ev), opts);
  return results;
};

const cfg: FlowConfig = { adapter: TurboAdapter, mode: "streaming" };

describe("flushTemplates", () => {
  it("emits a fragment for a one-shot node entry", async () => {
    const store = createTemplateStore(cfg);
    store.register("t1", { content: () => <div>Hello</div>, merge: "replace" });
    const results = await drain(store);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("fragment");
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("Hello");
  });

  it("emits a fragment for plain JSX content (no factory)", async () => {
    const store = createTemplateStore(cfg);
    store.register("t2", { content: <div>Plain</div>, merge: "replace" });
    const results = await drain(store);
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("Plain");
  });

  it("streams each item of an async-iterable entry", async () => {
    async function* rows() {
      yield (<li>a</li>) as ResolvedVNode;
      yield (<li>b</li>) as ResolvedVNode;
    }
    const store = createTemplateStore(cfg);
    store.register("feed", { content: () => rows(), merge: "append" });
    const results = await drain(store);
    const fragments = results.filter((e) => e.type === "fragment");
    expect(fragments).toHaveLength(2);
  });

  it("catches a factory throw and continues other entries", async () => {
    const store = createTemplateStore(cfg);
    store.register("plain", { content: <div>Plain</div>, merge: "replace" });
    store.register("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
    });
    const results = await drain(store);
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment") expect(results[0]!.id).toBe("plain");
  });

  it("emits an error fallback fragment when onError returns a node", async () => {
    const store = createTemplateStore(cfg);
    store.register("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
    });
    const results = await drain(store, {
      onError: () => <span>error-fallback</span>,
    });
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("error-fallback");
  });

  it("a per-entry onError overrides the global one", async () => {
    const store = createTemplateStore(cfg);
    store.register("bad", {
      content: () => {
        throw new Error("fail");
      },
      merge: "replace",
      onError: () => <span>local</span>,
    });
    const results = await drain(store, {
      onError: () => <span>global</span>,
    });
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("local");
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
      return (<div>too late</div>) as ResolvedVNode;
    };
    const store = createTemplateStore(cfg);
    store.register("slow", { content: slow, merge: "replace", timeout: 10 });
    const results = await drain(store, {
      onError: (err) => <span>{(err as Error).message}</span>,
    });
    if (results[0]!.type === "fragment") {
      expect(results[0]!.html).toContain('Template "slow" timed out after 10ms');
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
    const store = createTemplateStore(cfg);
    store.register("slow", { content, merge: "replace" });
    const results = await drain(store, {
      defaultTimeout: 10,
      onError: (err) => <span>{(err as Error).message}</span>,
    });
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("timed out after 10ms");
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
        yield (<li>{i}</li>) as ResolvedVNode;
        await Promise.resolve(); // yield event loop — let abort propagate
      }
    }
    const stream = renderToStream(
      () => (
        <html>
          <body>
            <ul id="feed" />
            <Template target="feed" merge="append">
              {(signal) => inf(signal!)}
            </Template>
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
        yield (<span>{i}</span>) as ResolvedVNode;
      }
    }
    const stream = renderToStream(
      () => (
        <html>
          <body>
            <div id="out" />
            <Template target="out" merge="append">
              {() => many()}
            </Template>
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
              <Template target="crash">
                {() => {
                  throw new Error("crash");
                }}
              </Template>
              <Template target="ok">{() => <span>ok</span>}</Template>
            </body>
          </html>
        ),
        TurboAdapter,
        { onError: () => <div>err-fallback</div> },
      ),
    );
    const fragments = events.filter((e): e is FragmentEvent => e.type === "fragment");
    expect(fragments.find((p) => p.id === "crash")?.html).toContain("err-fallback");
    expect(fragments.find((p) => p.id === "ok")?.html).toContain("ok");
  });

  it("stream throw mid-iteration → onError kind=stream", async () => {
    const errors: Array<{ kind: string }> = [];
    async function* g() {
      yield (<span>first</span>) as ResolvedVNode;
      throw new Error("mid-crash");
    }
    await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <div id="out" />
              <Template target="out" merge="append">
                {() => g()}
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
        {
          onError(_err, info) {
            errors.push(info);
            return (<span>recovered</span>) as ResolvedVNode;
          },
        },
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("stream");
  });
});
