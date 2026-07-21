/**
 * Bench comparatif : @vincle/flow vs Preact vs @kitajs/html
 *
 * Suites :
 *  1. Sync page — les 3 frameworks (render to string)
 *  2. Async children avec streaming — les 3 (promesses + fallback)
 *  3. Lazy factory — Flow uniquement
 *  4. Stream (async generator) — Flow uniquement
 *
 * .ts (pas .tsx) pour éviter conflits jsxImportSource.
 */
import { bench, group, run } from "mitata";
import { text } from "node:stream/consumers";

// --- @vincle/flow ---
import { jsx as vjsx } from "@vincle/core/jsx-runtime";
import type { VNode } from "@vincle/core";
import { renderToStream, Template } from "@vincle/flow";
import { TurboAdapter } from "@vincle/flow/adapters";

// --- Preact ---
import { h } from "preact";
import renderToString from "preact-render-to-string";
import { renderToReadableStream } from "preact-render-to-string/stream";
import type { VNode as PVNode } from "preact";

// --- @kitajs/html v4 ---
import { jsx as kjsx, Fragment as kfrag } from "@kitajs/html/jsx-runtime";
import { renderToStream as kitaRenderToStream, Suspense as KitaSuspense } from "@kitajs/html/suspense";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks.join("");
}

async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(buf);
}

// ---------------------------------------------------------------------------
// Async helpers — composant async qui fait await Promise.resolve()
// ---------------------------------------------------------------------------

function delay(): Promise<void> {
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// 1. Sync page
// ---------------------------------------------------------------------------

function flowSyncPage(n: number): VNode {
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(vjsx("li", { key: i, children: `item-${i}` }));
  }
  return vjsx("html", {
    children: [
      vjsx("head", { children: vjsx("title", { children: "Sync" }) }),
      vjsx("body", {
        children: [vjsx("h1", { children: "Sync" }), vjsx("ul", { children: items })],
      }),
    ],
  });
}

function preactSyncPage(n: number): PVNode {
  const items: PVNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(h("li", { key: i }, `item-${i}`));
  }
  return h("html", null, [
    h("head", null, h("title", null, "Sync")),
    h("body", null, [h("h1", null, "Sync"), h("ul", null, items)]),
  ]);
}

function kitaSyncPage(n: number): string {
  const items: string[] = [];
  for (let i = 0; i < n; i++) {
    items.push(kjsx("li", { key: i, children: `item-${i}` }));
  }
  return kjsx("html", {
    children: [
      kjsx("head", { children: kjsx("title", { children: "Sync" }) }),
      kjsx("body", { children: [kjsx("h1", { children: "Sync" }), kjsx("ul", { children: items })] }),
    ],
  });
}

group("1. Sync page — render to string", () => {
  bench("flow    10", async () => {
    await collect(renderToStream(() => flowSyncPage(10), TurboAdapter));
  });
  bench("preact  10", () => {
    renderToString(preactSyncPage(10));
  });
  bench("kita    10", () => {
    kitaSyncPage(10);
  });

  bench("flow    50", async () => {
    await collect(renderToStream(() => flowSyncPage(50), TurboAdapter));
  });
  bench("preact  50", () => {
    renderToString(preactSyncPage(50));
  });
  bench("kita    50", () => {
    kitaSyncPage(50);
  });

  bench("flow    100", async () => {
    await collect(renderToStream(() => flowSyncPage(100), TurboAdapter));
  });
  bench("preact  100", () => {
    renderToString(preactSyncPage(100));
  });
  bench("kita    100", () => {
    kitaSyncPage(100);
  });
});

// ---------------------------------------------------------------------------
// 2. Streaming avec async children — les 3 frameworks
// ---------------------------------------------------------------------------

function flowStreamPage(n: number): VNode {
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(
      vjsx(Template, {
        target: `t${i}`,
        fallback: vjsx("div", { children: "..." }),
        children: (async () => {
          await delay();
          return vjsx("span", { children: `item-${i}` });
        })(),
      }),
    );
  }
  return vjsx("html", {
    children: [vjsx("body", { children: items })],
  });
}

function kitaStreamPage(rid: number | string, n: number): string {
  // Kita Suspense needs JSX.Element children; async returns Promise<JSX.Element>
  const items: string[] = [];
  for (let i = 0; i < n; i++) {
    items.push(
      kjsx(KitaSuspense, {
        rid,
        fallback: kjsx("div", { children: "..." }),
        children: (async () => {
          await delay();
          return kjsx("span", { children: `item-${i}` });
        })(),
      }) as string,
    );
  }
  return kjsx("html", { children: [kjsx("body", { children: items })] });
}

function preactStreamPage(n: number): PVNode {
  // Preact's renderToReadableStream handles async/Suspense natively
  const items: PVNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(
      h("div", null, [
        // Simulate async: wrap in a promise-like component
        // Preact renderToReadableStream handles Promises in children
        (async () => {
          await delay();
          return h("span", null, `item-${i}`);
        })(),
      ]),
    );
  }
  return h("html", null, [h("body", null, items)]);
}

group("2. Async children — streaming", () => {
  bench("flow    10 async", async () => {
    await collect(renderToStream(() => flowStreamPage(10), TurboAdapter));
  });
  bench("preact  10 async", async () => {
    await collectBytes(renderToReadableStream(preactStreamPage(10)));
  });
  bench("kita    10 async", async () => {
    const stream = kitaRenderToStream(
      (r: number | string) => kitaStreamPage(r, 10) as any,
    );
    await text(stream);
  });

  bench("flow    50 async", async () => {
    await collect(renderToStream(() => flowStreamPage(50), TurboAdapter));
  });
  bench("preact  50 async", async () => {
    await collectBytes(renderToReadableStream(preactStreamPage(50)));
  });
  bench("kita    50 async", async () => {
    const stream = kitaRenderToStream(
      (r: number | string) => kitaStreamPage(r, 50) as any,
    );
    await text(stream);
  });
});

// ---------------------------------------------------------------------------
// 3. Lazy factory — Flow uniquement
// ---------------------------------------------------------------------------

group("3. Lazy factory — flow only", () => {
  bench("flow    10 lazy", async () => {
    const makeItems = (): VNode => {
      const items: VNode[] = [];
      for (let i = 0; i < 10; i++) {
        const value = `item-${i}`;
        items.push(
          vjsx(Template, {
            target: `t${i}`,
            children: () => vjsx("span", { children: value }),
          }),
        );
      }
      return vjsx("html", { children: [vjsx("body", { children: items })] });
    };
    await collect(renderToStream(makeItems, TurboAdapter));
  });
});

// ---------------------------------------------------------------------------
// 4. Stream (async generator) — Flow uniquement
// ---------------------------------------------------------------------------

group("4. Stream — flow only (async generator)", () => {
  bench("flow    3 yields", async () => {
    async function* gen() {
      yield vjsx("li", { children: "a" });
      yield vjsx("li", { children: "b" });
      yield vjsx("li", { children: "c" });
    }
    await collect(
      renderToStream(
        () =>
          vjsx("html", {
            children: vjsx("body", {
              children: vjsx(Template, {
                target: "feed",
                merge: "append",
                children: gen(),
              }),
            }),
          }),
        TurboAdapter,
      ),
    );
  });
});

run();
