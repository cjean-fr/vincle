/**
 * Mesure le coût du wrapping async sur un arbre 100% statique.
 *
 * Scénarios :
 *   1. renderToString (Promise<string>) — awaité
 *   2. renderToString (Promise<string>) — direct (pas d'await, on manipule la Promise)
 *   3. baseline Promise.resolve(string) — coût nu du wrapping
 */

import { renderToString } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";
import { bench, group, run } from "mitata";

// ── Arbres 100% statiques (prebuild hors mesure) ──

const microTree = jsx("div", { class: "foo", children: "hello" });

function buildMeso() {
  const items = [];
  for (let i = 0; i < 50; i++) items.push(jsx("li", { class: "item", children: `item-${i}` }));
  return jsx("ul", { class: "list", children: items });
}
const mesoTree = buildMeso();

function buildPage() {
  const rows = [];
  for (let i = 0; i < 100; i++) {
    rows.push(
      jsx("tr", { class: i % 2 ? "even" : "odd", children: [
        jsx("td", { children: `User ${i}` }),
        jsx("td", { children: `user${i}@example.com` }),
        jsx("td", { children: `Role ${i % 5}` }),
      ]}),
    );
  }
  return jsx("table", { id: "data-table", children: [
    jsx("thead", { children: jsx("tr", { children: [
      jsx("th", { children: "Name" }),
      jsx("th", { children: "Email" }),
      jsx("th", { children: "Role" }),
    ]})}),
    jsx("tbody", { children: rows }),
  ]});
}
const pageTree = buildPage();

// Warmup
for (let i = 0; i < 100; i++) {
  renderToString(microTree);
  renderToString(mesoTree);
  renderToString(pageTree);
}

// ── Micro bench (1 élément) ──

group("micro — 1 div", () => {
  bench("renderToString + await", async () => {
    await renderToString(microTree);
  });
  bench("renderToString direct", () => {
    renderToString(microTree);
  });
  bench("Promise.resolve('hello')", async () => {
    await Promise.resolve("hello");
  });
});

// ── Meso bench (50 éléments) ──

group("meso — 50 li dans ul", () => {
  bench("renderToString + await", async () => {
    await renderToString(mesoTree);
  });
  bench("renderToString direct", () => {
    renderToString(mesoTree);
  });
});

// ── Page bench (100 lignes de table) ──

group("page — table 100 lignes", () => {
  bench("renderToString + await", async () => {
    await renderToString(pageTree);
  });
  bench("renderToString direct", () => {
    renderToString(pageTree);
  });
});

await run();
