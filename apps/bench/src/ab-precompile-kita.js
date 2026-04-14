/**
 * Le chemin precompile de @vincle/core contre kitajs, à production égale.
 *
 * `text`, `stack` et `realworld` opposent la marche d'arbre de vincle à la
 * concaténation de kitajs — deux architectures. Le chemin precompile fait ce que
 * fait kitajs, et n'y avait jamais été confronté.
 *
 * Et kitajs n'échappe pas ses enfants par défaut, ce qu'il faut neutraliser
 * (`safe`) sinon on chiffre le prix de l'échappement en l'appelant écart de
 * performance. Les deux modes sont mesurés pour que ce prix reste lisible.
 *
 * 7 processus frais, médiane de 25 × 200 itérations, ± 3 erreurs-types :
 *   @vincle/core precompile     11,24 ± 0,32 µs
 *   @kitajs/html safe           18,70 ± 0,83 µs   → vincle 1,67× ± 0,10
 *   @kitajs/html défaut          7,17 ± 0,58 µs   → sortie non échappée
 *
 * Run : `NODE_ENV=production bun --conditions=dist run src/ab-precompile-kita.js`
 *       `--json` pour une ligne agrégeable sur plusieurs processus.
 */
import { createElement as kita } from "@kitajs/html";
import { jsxAttr, jsxEscape, jsxTemplate } from "@vincle/core/jsx-precompile-runtime";
import { bench, group, run } from "mitata";

const ROWS = 100;
// `& <` est le sujet : sans eux, les deux modes de kitajs rendent les mêmes octets.
const data = Array.from({ length: ROWS }, (_, i) => ({
  cls: i % 2 === 0 ? "row even" : "row odd",
  text: `Item ${i} — a & b < c`,
}));

const LI = ["<li ", ">", "</li>"];
const UL = ['<ul class="list">', "</ul>"];

function vinclePrecompile() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { cls, text } = data[i];
    rows[i] = jsxTemplate(LI, jsxAttr("class", cls), jsxEscape(text));
  }
  return String(jsxTemplate(UL, jsxEscape(rows)));
}

function kitajsSafe() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { cls, text } = data[i];
    rows[i] = kita("li", { class: cls, safe: true }, text);
  }
  return String(kita("ul", { class: "list" }, rows));
}

function kitajsDefault() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { cls, text } = data[i];
    rows[i] = kita("li", { class: cls }, text);
  }
  return String(kita("ul", { class: "list" }, rows));
}

const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

function assertComparable() {
  const v = vinclePrecompile();
  const s = kitajsSafe();
  if (v !== s) {
    const i = firstDiff(v, s);
    console.error(`Sorties divergentes à ${i} — la comparaison serait fausse.`);
    console.error(`  vincle : ${JSON.stringify(v.slice(i, i + 60))}`);
    console.error(`  kitajs : ${JSON.stringify(s.slice(i, i + 60))}`);
    process.exit(1);
  }
  return { bytes: v.length, unescaped: kitajsDefault().length };
}

/** Médiane, pas moyenne : robuste aux pauses du GC. */
function measure(fn) {
  for (let i = 0; i < 2000; i++) fn();
  const samples = [];
  for (let s = 0; s < 25; s++) {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) fn();
    samples.push(((performance.now() - t0) * 1000) / 200);
  }
  return samples.toSorted((a, b) => a - b)[Math.floor(samples.length / 2)];
}

const { bytes, unescaped } = assertComparable();

if (process.argv.includes("--json")) {
  // Deux passes en ordre inverse : le minimum retire l'avantage du JIT froid.
  const out = {
    vincle: measure(vinclePrecompile),
    kitaSafe: measure(kitajsSafe),
    kitaDefault: measure(kitajsDefault),
  };
  out.kitaDefault = Math.min(out.kitaDefault, measure(kitajsDefault));
  out.kitaSafe = Math.min(out.kitaSafe, measure(kitajsSafe));
  out.vincle = Math.min(out.vincle, measure(vinclePrecompile));
  console.log(JSON.stringify(out));
} else {
  console.log(
    `sorties identiques — ${bytes} o ; kitajs sans \`safe\` en produit ${unescaped} (non échappés)\n`,
  );
  group(`liste ${ROWS} lignes — aucun arbre construit des deux côtés`, () => {
    bench("@vincle/core (precompile, échappe)", () => void vinclePrecompile());
    bench("@kitajs/html (safe, échappe)", () => void kitajsSafe());
    bench("@kitajs/html (défaut, n'échappe pas)", () => void kitajsDefault());
  });
  await run();
}
