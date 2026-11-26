/**
 * bench.js: realistic SSR benchmark (JS port of bench.ts)
 *
 * Suites ported from other projects' benchmarks (see README, "Where the cases
 * come from", for the links and what differs):
 *   - text: 1000× two-span text blocks (wide tree), from preact-render-to-string
 *     benchmarks/text.js
 *   - stack: 10× 1000-deep recursive trees, from preact-render-to-string
 *     benchmarks/stack.js
 *   - realworld : full layout/head/header/footer/purchases/sidebar page,
 *                 a port of @kitajs/html's RealWorldPage
 *                 (benchmarks/kitajs/index.tsx)
 *
 * Run: `NODE_ENV=production bun run src/bench.js`
 */

import { createElement as kita } from "@kitajs/html";
import * as Vincle from "@vincle/core";
import * as PrecompileRuntime from "@vincle/core/jsx-precompile-runtime";
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
import { render as realworldPrecompiled } from "./realworld/shared.precompiled.mjs";
import { render as realworldVincle } from "./realworld/vincle.js";

const { createContext, renderToString, useContext } = Vincle;
const { jsxAttr, jsxEscape, jsxEscapeDeferred, jsxTemplate, jsxTemplateDeferred } =
  PrecompileRuntime;

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

// 1. Text and 2. stack: the preact-render-to-string benchmarks, with their
// components. `Bavaria` is a function component, `Leaf` and `PassThrough` too,
// one `PassThrough` per level. The same trees are built for every library, each
// with its own element function; only the attribute name for the class differs.

function makeTrees(el, classAttr) {
  const Bavaria = () =>
    el(
      "div",
      null,
      el("span", { [classAttr]: "foo", "data-testid": "foo" }, BAVARIA_1),
      el("span", { [classAttr]: "bar", "data-testid": "bar" }, BAVARIA_2),
    );
  const Leaf = () =>
    el("div", null, el("span", { [classAttr]: "foo", "data-testid": "stack" }, "deep stack"));
  const PassThrough = (props) => el("div", null, props.children);
  const recursive = (n) => (n <= 0 ? el(Leaf, null) : el(PassThrough, null, recursive(n - 1)));
  const textApp = () => {
    const children = [];
    for (let i = 0; i < TEXT_REPEATS; i++) children[i] = el(Bavaria, null);
    return el("div", null, children);
  };
  const stackApp = () => {
    const children = [];
    for (let i = 0; i < STACK_REPEATS; i++) children[i] = recursive(STACK_DEPTH);
    return el("div", null, children);
  };
  return { textApp, stackApp };
}

const vincleTrees = makeTrees(
  (type, props, ...children) =>
    jsx(type, { ...props, children: children.length === 1 ? children[0] : children }),
  "class",
);
const reactTrees = makeTrees(createElement, "className");
const preactTrees = makeTrees(h, "class");
const honoTrees = makeTrees(honoJsx, "class");
const kitaBench = makeTrees(kita, "class");

const textAppVincle = vincleTrees.textApp;
const textAppReact = reactTrees.textApp;
const textAppPreact = preactTrees.textApp;
const textAppHono = honoTrees.textApp;
const stackAppVincle = vincleTrees.stackApp;
const stackAppReact = reactTrees.stackApp;
const stackAppPreact = preactTrees.stackApp;
const stackAppHono = honoTrees.stackApp;

// 4. Precompile: the same list, both ways
//
// A second renderer, with hot loops of its own that no case above exercises, and
// the one case where the two terms are both ours: what the precompile transform
// emits against the tree walk it replaces. The shape is what the transform
// actually emits, and the bytes are asserted equal below: a ratio between two
// documents would be a ratio between two workloads.

// A row the way a template really comes out: literal markup the transform inlines,
// and holes for what it cannot know. The mix is the measurement: with nothing
// literal the transform has nothing to inline and the two paths are level (3% on
// this list), with a literal class it is 35%. A fixture at either end would
// answer a question nobody has.
const PRECOMPILE_ROWS = 100;
const PRECOMPILE_LI = ['<li class="item" ', ">", "</li>"];
const PRECOMPILE_UL = ['<ul class="list">', "</ul>"];
const precompileData = Array.from({ length: PRECOMPILE_ROWS }, (_, i) => ({
  index: i,
  text: `Item ${i}: a & b < c`,
}));

// Provider fixtures: one source with ten literal paragraphs and one with many
// readers. Both paths perform the same work outside what the JSX transform
// itself can eliminate; a runtime map versus precomputed literals would not.
const Locale = createContext?.("fr");
const staticRows =
  '<p class="row">Static 0</p><p class="row">Static 1</p><p class="row">Static 2</p>' +
  '<p class="row">Static 3</p><p class="row">Static 4</p><p class="row">Static 5</p>' +
  '<p class="row">Static 6</p><p class="row">Static 7</p><p class="row">Static 8</p>' +
  '<p class="row">Static 9</p>';
const translatedRows = Array.from({ length: 100 }, (_, i) => i);
const LocaleReader = ({ index }) => jsx("li", { children: `${useContext(Locale)}:${index}` });
// The transform emits these two direct helpers for a template-literal text
// hole. Precompile the reader as well as the outer <ul>, as a real build does.
const PrecompiledLocaleReader = ({ index }) =>
  jsxTemplate(["<li>", "</li>"], jsxEscape(`${useContext(Locale)}:${index}`));
const StaticReader = () => jsx("b", { children: useContext(Locale) });
const PrecompiledStaticReader = () =>
  jsxTemplateDeferred(["<b>", "</b>"], jsxEscapeDeferred(useContext(Locale)));

function providerStaticRuntime() {
  return jsx(Locale.Provider, {
    value: "en",
    children: jsx("main", {
      children: [
        jsx("p", { class: "row", children: "Static 0" }),
        jsx("p", { class: "row", children: "Static 1" }),
        jsx("p", { class: "row", children: "Static 2" }),
        jsx("p", { class: "row", children: "Static 3" }),
        jsx("p", { class: "row", children: "Static 4" }),
        jsx("p", { class: "row", children: "Static 5" }),
        jsx("p", { class: "row", children: "Static 6" }),
        jsx("p", { class: "row", children: "Static 7" }),
        jsx("p", { class: "row", children: "Static 8" }),
        jsx("p", { class: "row", children: "Static 9" }),
        jsx(StaticReader, {}),
      ],
    }),
  });
}
// A tagged template's strings are one array per call site, which is what the
// transform emits: built once, not on each render.
const providerStaticStrings = [`<main>${staticRows}`, "</main>"];
function providerStaticPrecompile() {
  return jsx(Locale.Provider, {
    value: "en",
    children: jsxTemplateDeferred(providerStaticStrings, jsx(PrecompiledStaticReader, {})),
  });
}
function providerTranslationsRuntime() {
  return jsx(Locale.Provider, {
    value: "en",
    children: jsx("ul", { children: translatedRows.map((index) => jsx(LocaleReader, { index })) }),
  });
}
function providerTranslationsPrecompile() {
  return jsx(Locale.Provider, {
    value: "en",
    children: jsxTemplateDeferred(
      ["<ul>", "</ul>"],
      translatedRows.map((index) => jsx(PrecompiledLocaleReader, { index })),
    ),
  });
}

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

// Primitive array holes are distinct from rows of pre-rendered RawStrings.
const ARRAY_TEMPLATE = ["<div>", "</div>"];
const arrayFixtures = {
  "array-small": Array.from({ length: 16 }, (_, i) => `Item ${i}: a & b < c`),
  "array-large": Array.from({ length: 1000 }, (_, i) => `Item ${i}: a & b < c`),
  "array-mixed": Array.from({ length: 200 }, (_, i) => [
    `Item ${i}: a & b < c`,
    i,
    null,
    false,
    Vincle.raw("<b>trusted</b>"),
  ]).flat(),
};

// Measured cases
//
// The short key is what `stats.js` aggregates and what a baseline is indexed on:
// renaming a case invalidates the comparisons, which is the point. It is carried
// by the line that measures, so no two lists have to be held in the same order
// for a result to come out under the right name.

const CASES = {
  text: `text: ${TEXT_REPEATS}× Bavaria block (preact bench port)`,
  stack: `stack: ${STACK_REPEATS}× ${STACK_DEPTH}-deep tree (preact bench port)`,
  realworld: `realworld: full page, ${PURCHASES.length} purchases (kitajs port)`,
  precompile: `precompile: ${PRECOMPILE_ROWS}-row list, tree walk vs jsxTemplate (vincle only)`,
  "realworld-precompile": `realworld-precompile: full page, ${PURCHASES.length} purchases, tree walk vs the real precompile transform (vincle only)`,
  "provider-static": "provider-static: root Provider, mostly literal markup",
  "provider-translations": "provider-translations: root Provider, 100 readers",
  "array-small": "array-small: 16 primitive text values",
  "array-large": "array-large: 1000 primitive text values",
  "array-mixed": "array-mixed: 1000 text, numeric, empty and trusted values",
};

// Build the pages outside the bench so that only the render is measured
const rwVincle = () => realworldVincle(NAME, PURCHASES);
const rwPrecompiled = () => realworldPrecompiled(NAME, PURCHASES);
const rwReact = () => realworldReact(NAME, PURCHASES);
const rwPreact = () => realworldPreact(NAME, PURCHASES);
const rwHono = () => realworldHono(NAME, PURCHASES);
const rwKita = () => realworldKita(NAME, PURCHASES);

// The order is the order of measurement: every line inherits the inline caches
// the ones before it left behind, and that context is what resembles an
// application. `@vincle/core` opens each case: the ratio reads against it.

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

  ["realworld-precompile", "@vincle/core", () => rwVincle()],
  ["realworld-precompile", "@vincle/core (precompile)", () => rwPrecompiled()],
];
if (Locale) {
  BENCHES.push(
    ["provider-static", "@vincle/core", () => renderToString(providerStaticRuntime())],
    [
      "provider-static",
      "@vincle/core (precompile)",
      () => renderToString(providerStaticPrecompile()),
    ],
    ["provider-translations", "@vincle/core", () => renderToString(providerTranslationsRuntime())],
    [
      "provider-translations",
      "@vincle/core (precompile)",
      () => renderToString(providerTranslationsPrecompile()),
    ],
  );
}
for (const [kase, values] of Object.entries(arrayFixtures)) {
  const runtime = () => renderToString(jsx("div", { children: values }));
  const precompiled = () => renderToString(jsxTemplate(ARRAY_TEMPLATE, jsxEscape(values)));
  if ((await runtime()) !== (await precompiled())) throw new Error(`${kase}: paths differ`);
  BENCHES.push([kase, "@vincle/core", runtime], [kase, "@vincle/core (precompile)", precompiled]);
}

// Measurement budget
//
// `measure()` warms the case up, then samples until it holds both `min_samples`
// samples and `min_cpu_time` of accumulated time.
//
// mitata's defaults, unmodified: 642 ms per case and a warm-up that stops at the
// first call running past 0.5 ms, which most cases here do.
//
// Neither can be chosen on the spread, which is what the protocol decides on.
// Three batches of 25 runs at one warm-up setting give a between-run cv of 2.1%,
// 3.1% and 9.2%: at that sample size a single unlucky process triples a standard
// deviation, so the estimate moves further than the settings do. The
// interquartile range is no steadier. A tuned budget therefore has nothing to
// show for itself, and the default is the value nobody has to defend.
//
// What the short warm-up costs is measured, and accepted: a case is sampled
// before the JIT has settled. On `realworld` the ratio against kitajs reads 0.67
// at mitata's default and 0.71 at 64 warm-up calls (n=15, ratios taken inside one
// process, 3 standard errors apart). The published ratio understates Vincle by
// about 6% for it.

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
  // The full page, the two spellings this engine can load: the `jsx()` port and
  // what the transform emits (gen-precompile.mjs holds the JSX-source spelling
  // and asserts all three agree, which needs a runtime that reads `.tsx`).
  const [jsPort, precompiled] = await Promise.all([
    realworldVincle(NAME, PURCHASES),
    realworldPrecompiled(NAME, PURCHASES),
  ]);
  if (jsPort !== precompiled) {
    throw new Error("realworld-precompile and the tree walk do not render the same page");
  }
}

const results = [];
const requestedCases = process.env.VINCLE_BENCH_CASES?.split(",");
if (requestedCases?.some((kase) => !(kase in CASES))) throw new Error("Unknown benchmark case");
for (const [kase, name, fn] of BENCHES) {
  if (requestedCases && !requestedCases.includes(kase)) continue;
  const { avg } = await measure(fn);
  results.push({ case: kase, name, opsPerSec: 1e9 / avg });
}
if (Locale) {
  for (const [runtime, precompiled] of [
    [providerStaticRuntime, providerStaticPrecompile],
    [providerTranslationsRuntime, providerTranslationsPrecompile],
  ]) {
    if ((await renderToString(runtime())) !== (await renderToString(precompiled()))) {
      throw new Error("Provider paths rendered different markup");
    }
  }
}

// `--json` emits one machine-readable line and nothing else: a single run of
// this benchmark is not a measurement (between-run spread is 2–4%), so the
// aggregation belongs to `stats.js`, which runs this many times. See
// apps/bench/README.md: the measurement protocol lives there.
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results));
  const { measurementEnvironment, METADATA_PREFIX } = await import("./measurement.js");
  console.error(METADATA_PREFIX + JSON.stringify(measurementEnvironment(import.meta.url)));
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
    "\n  One run is not a measurement: use `bun run bench:stats` before claiming a delta.\n" +
      "  ops/s belong to this harness. The × ratios divide out the machine, but not a\n" +
      "  change of harness: the last one moved them by up to 7%. Re-record, don't compare.",
  );
}
