/**
 * bench.js — realistic SSR benchmark (JS port of bench.ts)
 *
 * Suites ported from the official benchmarks:
 *   - text      : 1000× two-span text block (wide tree) — preact-render-to-string bench
 *   - stack     : 10× 1000-deep recursive tree (deep tree) — preact-render-to-string bench
 *   - realworld : full layout/head/header/footer/purchases/sidebar page —
 *                 a port of @kitajs/html's RealWorldPage
 *
 * Run: `NODE_ENV=production bun run src/bench.js`
 */

import { createElement as kita } from "@kitajs/html";
import { renderToString } from "@vincle/core";
import { jsxAttr, jsxEscape, jsxTemplate } from "@vincle/core/jsx-precompile-runtime";
import { jsx } from "@vincle/core/jsx-runtime";
import { jsx as honoJsx } from "hono/jsx";
import { measure } from "mitata";
import { h } from "preact";
import { render as preactRender } from "preact-render-to-string";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NAME, generatePurchases } from "./realworld/data.js";
import { render as realworldHono } from "./realworld/hono.js";
import { render as realworldKita } from "./realworld/kitajs.js";
import { render as realworldPreact } from "./realworld/preact.js";
import { render as realworldReact } from "./realworld/react.js";
import { render as realworldVincle } from "./realworld/vincle.js";

// Data

const BAVARIA_1 =
  "Bavaria ipsum dolor sit amet gwiss Charivari Auffisteign koa. Umma pfenningguat vui huift vui back mas Landla Bradwurschtsemmal, Fingahaggln. Wolpern ja, wo samma denn wea nia ausgähd, kummt nia hoam baddscher i moan oiwei! Kloan pfenningguat is Charivari Bussal, hallelujah sog i, luja. Liberalitas Bavariae hod Schorsch om auf'n Gipfe gwiss naa. Und ja, wo samma denn Ohrwaschl hoggd auffi Spotzerl Diandldrahn, oba? Is sog i und glei wirds no fui lustiga Biaschlegl ma nimma ned woar gscheckate, pfenningguat! Gstanzl dei Schorsch Radi i mog di fei hea Reiwadatschi fensdaln dei glei a Hoiwe. Bitt umananda ghupft wia gsprunga Gschicht kimmt, oamoi obandeln. Sog i helfgod amoi hallelujah sog i, luja i hob di narrisch gean, Brodzeid. Wolln a Maß und no a Maß Gaudi obandln eana boarischer hallelujah sog i, luja Maßkruag greaßt eich nachad, Schmankal.";
const BAVARIA_2 =
  "Dei um Godds wujn naa Watschnbaam Obazda Trachtnhuat, Vergeltsgott Schneid Schbozal. Om auf'n Gipfe Ramasuri um Godds wujn eana. Wos sammawiedaguad sei Weißwiaschd da, hog di hi is des liab des umananda Brezn Sauakraud Diandldrahn. Vo de weida pfundig Kirwa de Sonn Hetschapfah Watschnpladdla auf gehds beim Schichtl Meidromml auffi lem und lem lossn! Watschnpladdla wolln measi obandeln griasd eich midnand Oachkatzlschwoaf is ma Wuascht sammawiedaguad aasgem. A so a Schmarn Weibaleid naa, des basd scho. Abfieseln helfgod Sauwedda middn ded schoo. A bissal wos gehd ollaweil Sauwedda is Servas wiavui wo hi o'ha, a liabs Deandl pfiad de nix. Maßkruag etza so spernzaln. Weiznglasl Bradwurschtsemmal da, Schdeckalfisch: Mei Musi bitt des wiad a Mordsgaudi kumm geh Biakriagal Greichats obacht?";

const TEXT_REPEATS = 1_000;
const STACK_REPEATS = 10;
const STACK_DEPTH = 1_000;

// Purchases for the realworld page
const PURCHASES = generatePurchases(1_000);

// 1. Text bench — 1000× Bavaria block (preact bench port)

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
    const children = [];
    for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavaria();
    return k("div", null, children);
  };
  const stack = (depth) =>
    depth <= 0
      ? k("div", null, k("span", { class: "foo", "data-testid": "stack" }, "deep stack"))
      : k("div", null, stack(depth - 1));
  const stackApp = () => {
    const children = [];
    for (let i = 0; i < STACK_REPEATS; i++) children[i] = stack(STACK_DEPTH);
    return k("div", null, children);
  };
  return { textApp, stackApp };
}
const kitaBench = makeKitaBuilders(kita);

function textAppVincle() {
  const children = [];
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaVincle();
  return jsx("div", { children });
}
function textAppReact() {
  const children = [];
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaReact();
  return createElement("div", null, children);
}
function textAppPreact() {
  const children = [];
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaPreact();
  return h("div", null, children);
}
function textAppHono() {
  const children = [];
  for (let i = 0; i < TEXT_REPEATS; i++) children[i] = bavariaHono();
  return honoJsx("div", {}, children);
}

// 2. Stack bench — 10× 1000-deep recursive tree (preact bench port)

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
  const children = [];
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackVincle(STACK_DEPTH);
  return jsx("div", { children });
}
function stackAppReact() {
  const children = [];
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackReact(STACK_DEPTH);
  return createElement("div", null, children);
}
function stackAppPreact() {
  const children = [];
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackPreact(STACK_DEPTH);
  return h("div", null, children);
}
function stackAppHono() {
  const children = [];
  for (let i = 0; i < STACK_REPEATS; i++) children[i] = stackHono(STACK_DEPTH);
  return honoJsx("div", {}, children);
}

// 4. Precompile — the same list, both ways
//
// A second renderer, with hot loops of its own that no case above exercises, and
// the one case where the two terms are both ours: what the precompile transform
// emits against the tree walk it replaces. The shape is what the transform
// actually emits, and the bytes are asserted equal below — a ratio between two
// documents would be a ratio between two workloads.

// A row the way a template really comes out: literal markup the transform inlines,
// and holes for what it cannot know. The mix is the measurement — with nothing
// literal the transform has nothing to inline and the two paths are level (3% on
// this list), with a literal class it is 35%. A fixture at either end would
// answer a question nobody has.
const PRECOMPILE_ROWS = 100;
const PRECOMPILE_LI = ['<li class="item" ', ">", "</li>"];
const PRECOMPILE_UL = ['<ul class="list">', "</ul>"];
const precompileData = Array.from({ length: PRECOMPILE_ROWS }, (_, i) => ({
  index: i,
  text: `Item ${i} — a & b < c`,
}));

/** What the transform emits. */
function precompileList() {
  const rows = [];
  for (let i = 0; i < PRECOMPILE_ROWS; i++) {
    const { index, text } = precompileData[i];
    rows[i] = jsxTemplate(PRECOMPILE_LI, jsxAttr("data-index", index), jsxEscape(text));
  }
  return jsxTemplate(PRECOMPILE_UL, jsxEscape(rows));
}

/** The same list as a tree, which is what the transform starts from. */
function runtimeList() {
  const rows = [];
  for (let i = 0; i < PRECOMPILE_ROWS; i++) {
    const { index, text } = precompileData[i];
    rows[i] = jsx("li", { class: "item", "data-index": index, children: text });
  }
  return jsx("ul", { class: "list", children: rows });
}

// Measured cases
//
// The short key is what `stats.js` aggregates and what a baseline is indexed on:
// renaming a case invalidates the comparisons, which is the point. It is carried
// by the line that measures, so no two lists have to be held in the same order
// for a result to come out under the right name.

const CASES = {
  text: `text — ${TEXT_REPEATS}× Bavaria block (preact bench port)`,
  stack: `stack — ${STACK_REPEATS}× ${STACK_DEPTH}-deep tree (preact bench port)`,
  realworld: `realworld — full page, ${PURCHASES.length} purchases (kitajs port)`,
  precompile: `precompile — ${PRECOMPILE_ROWS}-row list, tree walk vs jsxTemplate (vincle only)`,
};

// Build the pages outside the bench so that only the render is measured
const rwVincle = () => realworldVincle(NAME, PURCHASES);
const rwReact = () => realworldReact(NAME, PURCHASES);
const rwPreact = () => realworldPreact(NAME, PURCHASES);
const rwHono = () => realworldHono(NAME, PURCHASES);
const rwKita = () => realworldKita(NAME, PURCHASES);

// The order is the order of measurement: every line inherits the inline caches
// the ones before it left behind, and that context is what resembles an
// application. `@vincle/core` opens each case — the ratio reads against it.

/** @type {[keyof typeof CASES, string, () => unknown][]} */
const BENCHES = [
  ["text", "@vincle/core", () => renderToString(textAppVincle())],
  ["text", "react (renderToStaticMarkup)", () => renderToStaticMarkup(textAppReact())],
  ["text", "preact (render)", () => preactRender(textAppPreact())],
  ["text", "hono/jsx (toString)", () => String(textAppHono())],
  ["text", "@kitajs/html", () => kitaBench.textApp()],

  ["stack", "@vincle/core", () => renderToString(stackAppVincle())],
  ["stack", "react (renderToStaticMarkup)", () => renderToStaticMarkup(stackAppReact())],
  ["stack", "preact (render)", () => preactRender(stackAppPreact())],
  ["stack", "hono/jsx (toString)", () => String(stackAppHono())],
  ["stack", "@kitajs/html", () => kitaBench.stackApp()],

  ["realworld", "@vincle/core", () => rwVincle()],
  ["realworld", "react (renderToStaticMarkup)", () => rwReact()],
  ["realworld", "preact (render)", () => rwPreact()],
  ["realworld", "hono/jsx (toString)", () => rwHono()],
  ["realworld", "@kitajs/html", () => rwKita()],

  ["precompile", "@vincle/core", () => renderToString(runtimeList())],
  ["precompile", "@vincle/core (precompile)", () => renderToString(precompileList())],
];

// Measurement budget
//
// `measure()` warms the case up, then samples until it holds both `min_samples`
// samples and `min_cpu_time` of accumulated time.
//
// mitata's defaults — 642 ms per case, and a single warm-up call as soon as that
// call runs past 0.5 ms, which most cases here do — buy a precision internal to
// the process that the protocol makes nothing of: what decides is the spread
// between processes, and `stats.js` is what aggregates it. Measured over 8 runs,
// 250 ms and 16 warm-up calls give a between-run cv of 2.0% (median) where the
// defaults give 3.1%, for 4.5 s per run instead of 16.5.
const MEASURE = {
  min_cpu_time: 250e6,
  warmup_samples: 16,
  warmup_threshold: 100e6,
};

// mitata's `run()` is not used: its four empty calibrations cost 3.5 s per
// process and feed only its own display, of which `--json` keeps nothing.
// Two implementations, one document: a ratio between different bytes would be a
// ratio between different workloads.
{
  const [tree, template] = await Promise.all([
    renderToString(runtimeList()),
    renderToString(precompileList()),
  ]);
  if (tree !== template) {
    throw new Error("precompile and the tree walk do not render the same list");
  }
}

const results = [];
for (const [kase, name, fn] of BENCHES) {
  const { avg } = await measure(fn, { ...MEASURE });
  results.push({ case: kase, name, opsPerSec: 1e9 / avg });
}

// `--json` emits one machine-readable line and nothing else: a single run of
// this benchmark is not a measurement (between-run spread is 2–4%), so the
// aggregation belongs to `stats.js`, which runs this many times. See
// apps/bench/README.md — the measurement protocol lives there.
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results));
} else {
  const REF = "@vincle/core";
  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(14);
  let refOps = 0;
  let currentCase = "";
  for (const { case: kase, name, opsPerSec } of results) {
    if (kase !== currentCase) {
      console.log(`${currentCase === "" ? "" : "\n"}  ${CASES[kase]}`);
      currentCase = kase;
    }
    if (name === REF) {
      refOps = opsPerSec;
      console.log(`  ${name.padEnd(35)} ${fmt(opsPerSec)}  ref`);
    } else {
      console.log(`  ${name.padEnd(35)} ${fmt(opsPerSec)}  ×${(refOps / opsPerSec).toFixed(2)}`);
    }
  }
  console.log(
    "\n  One run is not a measurement — use `bun run bench:stats` before claiming a delta.\n" +
      "  ops/s belong to this harness. The × ratios divide out the machine, but not a\n" +
      "  change of harness — the last one moved them by up to 7%. Re-record, don't compare.",
  );
}
