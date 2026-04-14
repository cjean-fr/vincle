/**
 * Combien coûte la marche, séparément du fold ? Trois variantes du même document,
 * mêmes octets, même processus :
 *
 *   plat        — que des éléments, tout se plie à la construction. Le plancher.
 *   composants  — le fold s'arrête à chaque frontière. La forme réelle d'une page.
 *   kitajs      — la référence, sur les deux arbres.
 *
 * L'écart plat → composants est le prix des deux passes.
 */
import { jsx as kjsx } from "@kitajs/html/jsx-runtime";
import { jsx, renderToString } from "@vincle/core";
import { bench, group, run } from "mitata";

const ROWS = Array.from({ length: 1000 }, (_, i) => ({
  name: `Item ${i}`,
  price: `${i}.99`,
  qty: i % 7,
}));

/** Un item, en éléments purs — foldable de bout en bout. */
const flatItem = (h, r) =>
  h("div", {
    class: "purchase purchase-card",
    children: [
      h("div", { class: "purchase-name", children: r.name }),
      h("div", { class: "purchase-price", children: r.price }),
      h("div", { class: "purchase-quantity", children: r.qty }),
    ],
  });

/** Le même item, derrière une frontière de composant. */
const makeComponentItem = (h) => {
  const Item = ({ row }) => flatItem(h, row);
  return (r) => h(Item, { row: r });
};

const flatPage = (h) => h("div", { class: "purchases", children: ROWS.map((r) => flatItem(h, r)) });

const componentPage = (h) => {
  const item = makeComponentItem(h);
  return h("div", { class: "purchases", children: ROWS.map(item) });
};

// Équivalence avant mesure : trois documents identiques, sinon on compare des
// charges de travail différentes — l'erreur qui a produit un faux 3,7× hier.
const outs = await Promise.all([
  renderToString(flatPage(jsx)),
  renderToString(componentPage(jsx)),
  Promise.resolve(String(flatPage(kjsx))),
  Promise.resolve(String(componentPage(kjsx))),
]);
for (const o of outs.slice(1)) {
  if (o !== outs[0]) throw new Error("les variantes ne rendent pas le même document");
}
console.error(`document : ${(outs[0].length / 1024).toFixed(1)} KB, ${ROWS.length} items\n`);

group("arbre plat — que des éléments (le fold fait tout)", () => {
  bench("vincle", async () => await renderToString(flatPage(jsx)));
  bench("kitajs", () => String(flatPage(kjsx)));
});

group("arbre à composants — une frontière par item (le fold s'arrête)", () => {
  bench("vincle", async () => await renderToString(componentPage(jsx)));
  bench("kitajs", () => String(componentPage(kjsx)));
});

await run();
