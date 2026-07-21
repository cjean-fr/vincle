/**
 * Profile précis — Flow jsx() rend eagerly (comme Kita).
 * Le gap ne vient PAS d'un VNode tree.
 *
 * Mesures :
 *   A. jsx() only (RawString produit) — vs Kita string direct
 *   B. renderToStream (full pipeline) — vs A pour isoler le coût stream
 *   C. renderToStream + NativeAdapter (pas de Turbo) — même chose
 *   D. renderToString() via @vincle/core (pas de stream du tout)
 *   E. renderToStream avec un VNode pré-rendu (RawString) — coût purement stream
 *   F. renderToString asynchrone (API publique)
 */
import { bench, group, run } from "mitata";

import { jsx as vjsx } from "@vincle/core/jsx-runtime";
import type { VNode } from "@vincle/core";
import { renderToString } from "@vincle/core";
import { renderToStream } from "@vincle/flow";
import { NativeAdapter, TurboAdapter } from "@vincle/flow/adapters";
import { jsx as kjsx } from "@kitajs/html/jsx-runtime";

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

// ---- Pages de test ----

function pageVNodes(n: number): VNode {
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) items.push(vjsx("li", { children: `item-${i}` }));
  return vjsx("html", {
    children: [
      vjsx("head", { children: vjsx("title", { children: "Page" }) }),
      vjsx("body", { children: [vjsx("h1", { children: "Page" }), vjsx("ul", { children: items })] }),
    ],
  });
}

function pageKita(n: number): string {
  const items: string[] = [];
  for (let i = 0; i < n; i++) items.push(kjsx("li", { children: `item-${i}` }));
  return kjsx("html", {
    children: [
      kjsx("head", { children: kjsx("title", { children: "Page" }) }),
      kjsx("body", { children: [kjsx("h1", { children: "Page" }), kjsx("ul", { children: items })] }),
    ],
  });
}

// ===========================================================================
// A. jsx() only — Flow (eager → RawString) vs Kita (string direct)
//    C'est LE vrai coût du render, sans streaming.
// ===========================================================================

group("A. jsx() eager render", () => {
  bench("flow    10", () => pageVNodes(10));
  bench("kita    10", () => pageKita(10));
  bench("flow    50", () => pageVNodes(50));
  bench("kita    50", () => pageKita(50));
  bench("flow    100", () => pageVNodes(100));
  bench("kita    100", () => pageKita(100));
});

// ===========================================================================
// B. renderToString (@vincle/core) — unwrap RawString
//    Coût : appel async + unwrap
// ===========================================================================

group("B. renderToString (core API)", () => {
  bench("flow    10", async () => { await renderToString(pageVNodes(10)); });
  bench("flow    50", async () => { await renderToString(pageVNodes(50)); });
  bench("flow    100", async () => { await renderToString(pageVNodes(100)); });
});

// ===========================================================================
// C. renderToStream + NativeAdapter (no Turbo)
//    Coût : ReadableStream + adapter
// ===========================================================================

group("C. renderToStream + NativeAdapter", () => {
  bench("flow    10", async () => { await collect(renderToStream(() => pageVNodes(10), NativeAdapter)); });
  bench("flow    50", async () => { await collect(renderToStream(() => pageVNodes(50), NativeAdapter)); });
  bench("flow    100", async () => { await collect(renderToStream(() => pageVNodes(100), NativeAdapter)); });
});

// ===========================================================================
// D. renderToStream + TurboAdapter
//    Coût supplémentaire : Turbo stream format wrapping
// ===========================================================================

group("D. renderToStream + TurboAdapter", () => {
  bench("flow    10", async () => { await collect(renderToStream(() => pageVNodes(10), TurboAdapter)); });
  bench("flow    50", async () => { await collect(renderToStream(() => pageVNodes(50), TurboAdapter)); });
  bench("flow    100", async () => { await collect(renderToStream(() => pageVNodes(100), TurboAdapter)); });
});

// ===========================================================================
// E. renderToStream avec un RawString pré-rendu (pas de factory)
//    Mesure le coût PUREMENT stream
// ===========================================================================

group("E. renderToStream — RawString pré-rendu", () => {
  // pré-calcule le RawString une fois
  const raw = pageVNodes(100);
  bench("flow    100 (pre-rendered)", async () => {
    await collect(renderToStream(() => raw, NativeAdapter));
  });
});

// ===========================================================================
// F. Kita string direct (rappel baseline)
// ===========================================================================

group("F. Kita baseline", () => {
  bench("kita    10", () => pageKita(10));
  bench("kita    50", () => pageKita(50));
  bench("kita    100", () => pageKita(100));
});

run();
