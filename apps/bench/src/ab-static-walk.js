/**
 * What the walk costs, apart from the static path. Three variants of one document, same
 * bytes, same process:
 *
 *   flat        — elements only, all of it serialized at construction. The floor.
 *   components  — the static path stops at every boundary. What a page really is.
 *   kitajs      — the reference, on both trees.
 *
 * The flat → components gap is the price of the two passes.
 */
import { jsx as kjsx } from "@kitajs/html/jsx-runtime";
import { jsx, renderToString } from "@vincle/core";
import { bench, group, run } from "mitata";

const ROWS = Array.from({ length: 1000 }, (_, i) => ({
  name: `Item ${i}`,
  price: `${i}.99`,
  qty: i % 7,
}));

/** One item, elements only — serializable end to end. */
const flatItem = (h, r) =>
  h("div", {
    class: "purchase purchase-card",
    children: [
      h("div", { class: "purchase-name", children: r.name }),
      h("div", { class: "purchase-price", children: r.price }),
      h("div", { class: "purchase-quantity", children: r.qty }),
    ],
  });

/** The same item, behind a component boundary. */
const makeComponentItem = (h) => {
  const Item = ({ row }) => flatItem(h, row);
  return (r) => h(Item, { row: r });
};

const flatPage = (h) => h("div", { class: "purchases", children: ROWS.map((r) => flatItem(h, r)) });

const componentPage = (h) => {
  const item = makeComponentItem(h);
  return h("div", { class: "purchases", children: ROWS.map(item) });
};

// Equivalence before measurement: three identical documents, or what is compared
// is two different workloads — the mistake that once produced a false 3.7×.
const outs = await Promise.all([
  renderToString(flatPage(jsx)),
  renderToString(componentPage(jsx)),
  Promise.resolve(String(flatPage(kjsx))),
  Promise.resolve(String(componentPage(kjsx))),
]);
for (const o of outs.slice(1)) {
  if (o !== outs[0]) throw new Error("the variants do not render the same document");
}
console.error(`document: ${(outs[0].length / 1024).toFixed(1)} KB, ${ROWS.length} items\n`);

group("flat tree — elements only (the static path does everything)", () => {
  bench("vincle", async () => await renderToString(flatPage(jsx)));
  bench("kitajs", () => String(flatPage(kjsx)));
});

group("component tree — one boundary per item (the static path stops)", () => {
  bench("vincle", async () => await renderToString(componentPage(jsx)));
  bench("kitajs", () => String(componentPage(kjsx)));
});

await run();
