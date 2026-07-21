/**
 * Microbenchmark : mesurer le coût de chaque brique du pipeline.
 */
import { bench, group, run } from "mitata";
import { RawString } from "@vincle/core";
import { jsx as vjsx } from "@vincle/core/jsx-runtime";
import { jsx as kjsx } from "@kitajs/html/jsx-runtime";
import { h } from "preact";

// 1. Coût object allocation
group("1. Object allocation", () => {
  const s = "hello";
  bench("RawString", () => new RawString(s));
  bench("string direct", () => s);
});

// 2. Coût concaténation
group("2. String building", () => {
  const tag = "li", attr = "", content = "x";
  bench("concat", () => "<" + tag + attr + ">" + content + "</" + tag + ">");
  bench("template", () => `<${tag}${attr}>${content}</${tag}>`);
});

// 3. Coût d'un appel jsx() pour 1 élément simple
group("3. jsx() — 1 élément <li>x</li>", () => {
  bench("flow", () => vjsx("li", { children: "x" }));
  bench("kita", () => kjsx("li", { children: "x" }));
  bench("preact h()", () => h("li", null, "x"));
});

// 4. Avec attributs
group("4. jsx() — <div class=\"a\" id=\"b\">x</div>", () => {
  bench("flow", () => vjsx("div", { class: "a", id: "b", children: "x" }));
  bench("kita", () => kjsx("div", { class: "a", id: "b", children: "x" }));
  bench("preact", () => h("div", { class: "a", id: "b" }, "x"));
});

// 5. Élément avec attributs non-ASCII / spéciaux à échaper
group("5. jsx() — <div class=\"a&b\">x<y</div>", () => {
  bench("flow", () => vjsx("div", { class: "a&b", children: "x<y" }));
  bench("kita", () => kjsx("div", { class: "a&b", children: "x<y" }));
});

// 6. Scale : 50 éléments
group("6. 50 <li> dans un <ul>", () => {
  bench("flow", () => {
    const items = [];
    for (let i = 0; i < 50; i++) items.push(vjsx("li", { children: `item-${i}` }));
    return vjsx("ul", { children: items });
  });
  bench("kita", () => {
    const items = [];
    for (let i = 0; i < 50; i++) items.push(kjsx("li", { children: `item-${i}` }));
    return kjsx("ul", { children: items });
  });
  bench("preact", () => {
    const items = [];
    for (let i = 0; i < 50; i++) items.push(h("li", null, `item-${i}`));
    return h("ul", null, items);
  });
});

run();
