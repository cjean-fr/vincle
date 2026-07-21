import type { ResolvedVNode, VNode } from "@vincle/core";

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
    store.register("t1", { content: <div>Hello</div>, merge: "replace" });
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
    store.register("feed", { content: rows(), merge: "append" });
    const results = await drain(store);
    const fragments = results.filter((e) => e.type === "fragment");
    expect(fragments).toHaveLength(2);
  });

  it("handles rejected promise content via onError", async () => {
    const store = createTemplateStore(cfg);
    // Use withResolvers: promise starts pending, rejected only when drain runs
    const { promise, reject } = Promise.withResolvers<VNode>();
    const content = promise.then(
      () => { throw new Error("fail"); },
      () => { throw new Error("fail"); },
    );
    content.catch(() => {}); // suppress unhandled rejection

    store.register("bad", { content: content as any, merge: "replace" });

    // Start drain and reject synchronously — renderToString will await content
    // which rejects via the .then() chain
    reject(new Error("trigger"));

    const results = await drain(store, {
      onError: () => <span>error-fallback</span>,
    });
    expect(results).toHaveLength(1);
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("error-fallback");
  });

  it("a per-entry onError overrides the global one", async () => {
    const store = createTemplateStore(cfg);
    const { promise, reject } = Promise.withResolvers<VNode>();
    const content = promise.then(
      () => { throw new Error("fail"); },
      () => { throw new Error("fail"); },
    );
    content.catch(() => {});

    store.register("bad", {
      content: content as any,
      merge: "replace",
      onError: () => <span>local</span>,
    });

    reject(new Error("trigger"));

    const results = await drain(store, {
      onError: () => <span>global</span>,
    });
    if (results[0]!.type === "fragment") expect(results[0]!.html).toContain("local");
  });
});

describe("edge cases — streaming", () => {
  it("reader cancel stops an infinite generator", async () => {
    async function* inf() {
      let i = 0;
      while (true) {
        i++;
        yield (<li>{i}</li>) as ResolvedVNode;
        await Promise.resolve();
      }
    }
    const stream = renderToStream(
      () => (
        <html>
          <body>
            <ul id="feed" />
            <Template target="feed" merge="append">
              {inf()}
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
              {many()}
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

  it("rejected promise with onError → error fragment, good siblings still emit", async () => {
    const events = await collectEvents(
      renderToFlowEvents(
        () => {
          const { promise, reject } = Promise.withResolvers<VNode>();
          const content = promise.then(
            () => { throw new Error("crash"); },
            () => { throw new Error("crash"); },
          );
          content.catch(() => {});
          reject(new Error("trigger"));

          return (
            <html>
              <body>
                <Template target="crash">{content as any}</Template>
                <Template target="ok">
                  <span>ok</span>
                </Template>
              </body>
            </html>
          );
        },
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
                {g()}
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
