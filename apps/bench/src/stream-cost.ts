/**
 * Mesurer précisément le coût ReadableStream vs string direct.
 * Objectif : savoir combien on peut gagner en court-circuitant le stream.
 */
import { bench, group, run } from "mitata";

import { jsx as vjsx } from "@vincle/core/jsx-runtime";
import { renderToString } from "@vincle/core";
import type { VNode } from "@vincle/core";
import { renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

// Lit un ReadableStream<string>
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

// Lit un ReadableStream<string> synchrone (start enqueue + close)
async function collectSyncStream(s: string): Promise<string> {
  const stream = new ReadableStream<string>({
    start(c) {
      c.enqueue(s);
      c.close();
    },
  });
  return collect(stream);
}

function makePage(n: number): VNode {
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) items.push(vjsx("li", { children: `item-${i}` }));
  return vjsx("html", {
    children: [
      vjsx("head", { children: vjsx("title", { children: "Page" }) }),
      vjsx("body", { children: [vjsx("h1", { children: "Page" }), vjsx("ul", { children: items })] }),
    ],
  });
}

// 0. Coût pur d'un ReadableStream vide
group("0. Coût ReadableStream nu", () => {
  bench("sync stream enqueue+close", async () => {
    await collectSyncStream("hello");
  });
  bench("promise direct", async () => {
    await Promise.resolve("hello");
  });
});

// 1. renderToString (pas de stream)
group("1. renderToString (core — pas de stream)", () => {
  bench("10 items", async () => { await renderToString(makePage(10)); });
  bench("100 items", async () => { await renderToString(makePage(100)); });
});

// 2. renderToStream (stream complet)
group("2. renderToStream + NativeAdapter", () => {
  bench("10 items", async () => { await collect(renderToStream(() => makePage(10), NativeAdapter)); });
  bench("100 items", async () => { await collect(renderToStream(() => makePage(100), NativeAdapter)); });
});

// 3. Sync shortcut: renderToString + wrap dans ReadableStream minimal
group("3. renderToString + sync ReadableStream wrapper", () => {
  bench("10 items", async () => {
    const html = await renderToString(makePage(10));
    await collectSyncStream(html);
  });
  bench("100 items", async () => {
    const html = await renderToString(makePage(100));
    await collectSyncStream(html);
  });
});

run();
