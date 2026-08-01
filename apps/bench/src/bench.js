/**
 * bench.js — realistic SSR benchmark (JS port of bench.ts)
 *
 * Suites portées depuis les benchmarks officiels :
 *   - text      : 1000× bloc texte 2 spans (wide tree) — preact-render-to-string bench
 *   - stack     : 10× arbre récursif 1000 deep (deep tree) — preact-render-to-string bench
 *   - realworld : page complète layout/head/header/footer/purchases/sidebar —
 *                 port de @kitajs/html RealWorldPage
 *   - async     : @vincle/core only (React/Preact ne rendent pas de composants async)
 *
 * Run : `NODE_ENV=production bun run src/bench.js`
 */

import { createElement as kita } from "@kitajs/html";
import { renderToString } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";
import { jsxAttr, jsxEscape, jsxTemplate } from "@vincle/core/jsx-precompile-runtime";
import { jsx as honoJsx } from "hono/jsx";
import { bench, group, run } from "mitata";
import { h } from "preact";
import { render as preactRender } from "preact-render-to-string";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NAME, generatePurchases } from "./realworld/data.js";
import { render as realworldHono } from "./realworld/hono.js";
import { render as realworldKita } from "./realworld/kitajs.js";
import { render as realworldPreact } from "./realworld/preact.js";
import { render as realworldReact } from "./realworld/react.js";
import { createRealWorldPage } from "./realworld/shared.js";
import { render as realworldVincle } from "./realworld/vincle.js";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const BAVARIA_1 =
  "Bavaria ipsum dolor sit amet gwiss Charivari Auffisteign koa. Umma pfenningguat vui huift vui back mas Landla Bradwurschtsemmal, Fingahaggln. Wolpern ja, wo samma denn wea nia ausgähd, kummt nia hoam baddscher i moan oiwei! Kloan pfenningguat is Charivari Bussal, hallelujah sog i, luja. Liberalitas Bavariae hod Schorsch om auf'n Gipfe gwiss naa. Und ja, wo samma denn Ohrwaschl hoggd auffi Spotzerl Diandldrahn, oba? Is sog i und glei wirds no fui lustiga Biaschlegl ma nimma ned woar gscheckate, pfenningguat! Gstanzl dei Schorsch Radi i mog di fei hea Reiwadatschi fensdaln dei glei a Hoiwe. Bitt umananda ghupft wia gsprunga Gschicht kimmt, oamoi obandeln. Sog i helfgod amoi hallelujah sog i, luja i hob di narrisch gean, Brodzeid. Wolln a Maß und no a Maß Gaudi obandln eana boarischer hallelujah sog i, luja Maßkruag greaßt eich nachad, Schmankal.";
const BAVARIA_2 =
  "Dei um Godds wujn naa Watschnbaam Obazda Trachtnhuat, Vergeltsgott Schneid Schbozal. Om auf'n Gipfe Ramasuri um Godds wujn eana. Wos sammawiedaguad sei Weißwiaschd da, hog di hi is des liab des umananda Brezn Sauakraud Diandldrahn. Vo de weida pfundig Kirwa de Sonn Hetschapfah Watschnpladdla auf gehds beim Schichtl Meidromml auffi lem und lem lossn! Watschnpladdla wolln measi obandeln griasd eich midnand Oachkatzlschwoaf is ma Wuascht sammawiedaguad aasgem. A so a Schmarn Weibaleid naa, des basd scho. Abfieseln helfgod Sauwedda middn ded schoo. A bissal wos gehd ollaweil Sauwedda is Servas wiavui wo hi o'ha, a liabs Deandl pfiad de nix. Maßkruag etza so spernzaln. Weiznglasl Bradwurschtsemmal da, Schdeckalfisch: Mei Musi bitt des wiad a Mordsgaudi kumm geh Biakriagal Greichats obacht?";

const TEXT_REPEATS = 1_000;
const STACK_REPEATS = 10;
const STACK_DEPTH = 1_000;

// Purchases pour realworld — 3 tailles
const PURCHASES = generatePurchases(1_000);

// ---------------------------------------------------------------------------
// 1. Text bench — 1000× Bavaria block (preact bench port)
// ---------------------------------------------------------------------------

const bavariaVincle = () =>
  jsx("div", {
    children: [
      jsx("span", { class: "foo", "data-testid": "foo", children: BAVARIA_1 }),
      jsx("span", { class: "bar", "data-testid": "bar", children: BAVARIA_2 }),
    ],
  });
const bavariaReact = () =>
  createElement(
    "div",
    null,
    createElement("span", { className: "foo", "data-testid": "foo" }, BAVARIA_1),
    createElement("span", { className: "bar", "data-testid": "bar" }, BAVARIA_2),
  );
const bavariaPreact = () =>
  h(
    "div",
    null,
    h("span", { class: "foo", "data-testid": "foo" }, BAVARIA_1),
    h("span", { class: "bar", "data-testid": "bar" }, BAVARIA_2),
  );
const bavariaHono = () =>
  honoJsx(
    "div",
    {},
    honoJsx("span", { class: "foo", "data-testid": "foo" }, BAVARIA_1),
    honoJsx("span", { class: "bar", "data-testid": "bar" }, BAVARIA_2),
  );

function makeKitaBuilders(k) {
  const bavaria = () =>
    k(
      "div",
      null,
      k("span", { class: "foo", "data-testid": "foo" }, BAVARIA_1),
      k("span", { class: "bar", "data-testid": "bar" }, BAVARIA_2),
    );
  const textApp = () => {
    const children = new Array(TEXT_REPEATS);
    for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavaria();
    return k("div", null, children);
  };
  const stack = (depth) =>
    depth <= 0
      ? k("div", null, k("span", { class: "foo", "data-testid": "stack" }, "deep stack"))
      : k("div", null, stack(depth - 1));
  const stackApp = () => {
    const children = new Array(STACK_REPEATS);
    for (let i = 0; i < STACK_REPEATS; i++) children[i] = stack(STACK_DEPTH);
    return k("div", null, children);
  };
  return { textApp, stackApp };
}
const kitaBench = makeKitaBuilders(kita);

function textAppVincle() {
  const children = new Array(TEXT_REPEATS);
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaVincle();
  return jsx("div", { children });
}
function textAppReact() {
  const children = new Array(TEXT_REPEATS);
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaReact();
  return createElement("div", null, children);
}
function textAppPreact() {
  const children = new Array(TEXT_REPEATS);
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaPreact();
  return h("div", null, children);
}
function textAppHono() {
  const children = new Array(TEXT_REPEATS);
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaHono();
  return honoJsx("div", {}, children);
}

// ---------------------------------------------------------------------------
// 2. Stack bench — 10× 1000-deep recursive tree (preact bench port)
// ---------------------------------------------------------------------------

function stackVincle(depth) {
  if (depth <= 0) {
    return jsx("div", {
      children: jsx("span", { class: "foo", "data-testid": "stack", children: "deep stack" }),
    });
  }
  return jsx("div", { children: stackVincle(depth - 1) });
}
function stackReact(depth) {
  if (depth <= 0) {
    return createElement(
      "div",
      null,
      createElement("span", { className: "foo", "data-testid": "stack" }, "deep stack"),
    );
  }
  return createElement("div", null, stackReact(depth - 1));
}
function stackPreact(depth) {
  if (depth <= 0) {
    return h("div", null, h("span", { class: "foo", "data-testid": "stack" }, "deep stack"));
  }
  return h("div", null, stackPreact(depth - 1));
}
function stackHono(depth) {
  if (depth <= 0) {
    return honoJsx(
      "div",
      {},
      honoJsx("span", { class: "foo", "data-testid": "stack" }, "deep stack"),
    );
  }
  return honoJsx("div", {}, stackHono(depth - 1));
}

function stackAppVincle() {
  const children = new Array(STACK_REPEATS);
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackVincle(STACK_DEPTH);
  return jsx("div", { children });
}
function stackAppReact() {
  const children = new Array(STACK_REPEATS);
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackReact(STACK_DEPTH);
  return createElement("div", null, children);
}
function stackAppPreact() {
  const children = new Array(STACK_REPEATS);
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackPreact(STACK_DEPTH);
  return h("div", null, children);
}
function stackAppHono() {
  const children = new Array(STACK_REPEATS);
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackHono(STACK_DEPTH);
  return honoJsx("div", {}, children);
}

// ---------------------------------------------------------------------------
// 3. Async — @vincle/core only
// ---------------------------------------------------------------------------

function vincleAsyncTree() {
  const AsyncItem = ({ i }) =>
    Promise.resolve().then(() => jsx("li", { class: "item", children: `Item ${i}` }));
  const items = Array.from({ length: 10 }, (_, i) => jsx(AsyncItem, { i }));
  return jsx("ul", { class: "list", children: items });
}

// ---------------------------------------------------------------------------
// 4. Precompile runtime — @vincle/core only
// ---------------------------------------------------------------------------
//
// The precompile transform (`jsxImportSource: "precompile"`) never builds a
// VNode: it emits `jsxTemplate` calls whose holes are filled by `jsxAttr` and
// `jsxEscape`. That is a second renderer with its own hot loops, and nothing
// above exercises it — `text`/`stack`/`realworld` all go through `jsx`.
//
// Shape below is what the transform actually emits for
// `<li class={cls}>{text}</li>` inside a `<ul>{items}</ul>`: one `jsxTemplate`
// per element, and one `jsxEscape` over the array of already-rendered rows
// (the call that dominates a list page).

const PRECOMPILE_ROWS = 100;
const PRECOMPILE_LI = ["<li ", ">", "</li>"];
const PRECOMPILE_UL = ['<ul class="list">', "</ul>"];
const precompileData = Array.from({ length: PRECOMPILE_ROWS }, (_, i) => ({
  cls: i % 2 === 0 ? "row even" : "row odd",
  text: `Item ${i} — a & b < c`,
}));

function precompileList() {
  const rows = new Array(PRECOMPILE_ROWS);
  for (let i = 0; i < PRECOMPILE_ROWS; i++) {
    const { cls, text } = precompileData[i];
    rows[i] = jsxTemplate(PRECOMPILE_LI, jsxAttr("class", cls), jsxEscape(text));
  }
  return jsxTemplate(PRECOMPILE_UL, jsxEscape(rows));
}

// ---------------------------------------------------------------------------
// Benchmark groups
// ---------------------------------------------------------------------------
//
// Each case is named once, here. The short key is what `stats.js` aggregates
// across runs and what a saved baseline is keyed on, so renaming a case
// deliberately invalidates comparisons against older baselines — which is the
// intent: a renamed case is usually a changed case.

const CASES = {
  async: "async — 10 concurrent async components (vincle only)",
  text: `text — ${TEXT_REPEATS}× Bavaria block (preact bench port)`,
  stack: `stack — ${STACK_REPEATS}× ${STACK_DEPTH}-deep tree (preact bench port)`,
  realworld: `realworld — full page, ${PURCHASES.length} purchases (kitajs port)`,
  precompile: `precompile — ${PRECOMPILE_ROWS}-row list via jsxTemplate/jsxAttr/jsxEscape (vincle only)`,
};

// --- Text ---

group(CASES.text, () => {
  bench("@vincle/core", async () => {
    await renderToString(textAppVincle());
  });
  bench("react (renderToStaticMarkup)", () => {
    renderToStaticMarkup(textAppReact());
  });
  bench("preact (render)", () => {
    preactRender(textAppPreact());
  });
  bench("hono/jsx (toString)", () => {
    String(textAppHono());
  });
  bench("@kitajs/html", () => {
    kitaBench.textApp();
  });
});

// --- Stack ---

group(CASES.stack, () => {
  bench("@vincle/core", async () => {
    await renderToString(stackAppVincle());
  });
  bench("react (renderToStaticMarkup)", () => {
    renderToStaticMarkup(stackAppReact());
  });
  bench("preact (render)", () => {
    preactRender(stackAppPreact());
  });
  bench("hono/jsx (toString)", () => {
    String(stackAppHono());
  });
  bench("@kitajs/html", () => {
    kitaBench.stackApp();
  });
});

// --- Async ---

group(CASES.async, () => {
  bench("@vincle/core", async () => {
    await renderToString(vincleAsyncTree());
  });
});

// --- Realworld (kitajs port) ---

// Pre-construire les pages hors du bench pour ne mesurer que le rendu
const rwVincle = () => realworldVincle(NAME, PURCHASES);
const rwReact = () => realworldReact(NAME, PURCHASES);
const rwPreact = () => realworldPreact(NAME, PURCHASES);
const rwHono = () => realworldHono(NAME, PURCHASES);
const rwKita = () => realworldKita(NAME, PURCHASES);

group(CASES.realworld, () => {
  bench("@vincle/core", async () => {
    await rwVincle();
  });
  bench("react (renderToStaticMarkup)", () => {
    rwReact();
  });
  bench("preact (render)", () => {
    rwPreact();
  });
  bench("hono/jsx (toString)", () => {
    rwHono();
  });
  bench("@kitajs/html", () => {
    rwKita();
  });
});

// --- Precompile runtime (vincle only) ---

group(CASES.precompile, () => {
  bench("@vincle/core", async () => {
    await precompileList();
  });
});

// ---------------------------------------------------------------------------
// Run & ratio vs @vincle/core
// ---------------------------------------------------------------------------

// `--json` emits one machine-readable line and nothing else: a single run of
// this benchmark is not a measurement (between-run spread is 2–4%), so the
// aggregation belongs to `stats.js`, which runs this many times. See
// apps/bench/README.md — the measurement protocol lives there.
const asJson = process.argv.includes("--json");

const { layout, benchmarks } = await run({ silent: asJson });

// `trial.group` indexes into `layout`, and `layout[i].name` is the string passed
// to `group()`. Mapping through the name is the only order-independent link
// between a trial and a `CASES` key.
//
// The previous version assumed trials arrive in `CASES` *declaration* order and
// consumed `Object.keys(CASES)` positionally. That silently mislabelled every
// case as soon as the object literal was reordered without reordering the
// `group()` calls — which had happened: `text` was reported as `async`, `stack`
// as `text`, `async` as `stack`. A mislabelled case is worse than a missing one,
// because `--against` then compares two unrelated suites and reports the
// difference as a regression.
const keyOfLabel = new Map(Object.entries(CASES).map(([key, label]) => [label, key]));
const results = [];
for (const trial of benchmarks) {
  const label = layout[trial.group]?.name;
  const kase = keyOfLabel.get(label) ?? `group${trial.group}`;
  for (const r of trial.runs) {
    results.push({
      case: kase,
      name: r.name,
      opsPerSec: 1e9 / r.stats.avg,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify(results));
} else {
  const REF = "@vincle/core";
  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(14);
  let refOps = 0;
  for (const { name, opsPerSec } of results) {
    if (name === REF) {
      if (refOps > 0) console.log();
      refOps = opsPerSec;
      console.log(`  ${name.padEnd(35)} ${fmt(opsPerSec)}  ref`);
    } else {
      console.log(`  ${name.padEnd(35)} ${fmt(opsPerSec)}  ×${(refOps / opsPerSec).toFixed(2)}`);
    }
  }
  console.log(
    "\n  One run is not a measurement — use `bun run bench:stats` before claiming a delta.",
  );
}
