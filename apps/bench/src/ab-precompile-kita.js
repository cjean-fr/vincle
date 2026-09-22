/**
 * @vincle/core's precompile path against kitajs, at equal production.
 *
 * `text`, `stack` and `realworld` set vincle's tree walk against kitajs's string
 * concatenation: two architectures. The precompile path does what kitajs does,
 * and had never been put against it.
 *
 * And kitajs does not escape its children by default, which has to be neutralised
 * (`safe`): otherwise the price of escaping is measured and reported as a
 * performance gap. Both modes are measured so that price stays legible.
 *
 * 7 fresh processes, median of 25 × 200 iterations, ± 3 standard errors:
 *
 *                              Bun / JSC        Node / V8
 *   @vincle/core precompile    9.19 ± 0.45    12.44 ± 0.20 µs
 *   @kitajs/html safe         12.92 ± 1.56    18.06 ± 0.58 µs   → vincle 1.40× / 1.45×
 *   @kitajs/html default       9.21 ± 1.28    11.09 ± 0.31 µs   → output not escaped
 *
 * Both engines, because a gap on one alone is an engine's own deoptimisation.
 *
 * Run: `NODE_ENV=production bun --conditions=dist run src/ab-precompile-kita.js`
 *      `--json` for one line that aggregates across processes.
 */
import { createElement as kita } from "@kitajs/html";
import { jsxAttr, jsxEscape, jsxTemplate } from "@vincle/core/jsx-precompile-runtime";
import { bench, group, run } from "mitata";

const ROWS = 100;
// `& <` is the point: without them, both kitajs modes render the same bytes.
//
// The row is what a template really comes out as: literal markup the transform
// inlines, and a hole for what it cannot know. With nothing literal the transform
// has nothing to inline and measures its own worst case: on this same list, the
// precompile path is level with the tree walk it replaces (3%), where a literal
// class puts it 35% ahead. A fixture at either end answers a question nobody has.
const data = Array.from({ length: ROWS }, (_, i) => ({
  index: i,
  text: `Item ${i}: a & b < c`,
}));

const LI = ['<li class="item" ', ">", "</li>"];
const UL = ['<ul class="list">', "</ul>"];

function vinclePrecompile() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { index, text } = data[i];
    rows[i] = jsxTemplate(LI, jsxAttr("data-index", index), jsxEscape(text));
  }
  return String(jsxTemplate(UL, jsxEscape(rows)));
}

function kitajsSafe() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { index, text } = data[i];
    rows[i] = kita("li", { class: "item", "data-index": index, safe: true }, text);
  }
  return String(kita("ul", { class: "list" }, rows));
}

function kitajsDefault() {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const { index, text } = data[i];
    rows[i] = kita("li", { class: "item", "data-index": index }, text);
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
    console.error(`Output diverges at ${i}: the comparison would be false.`);
    console.error(`  vincle : ${JSON.stringify(v.slice(i, i + 60))}`);
    console.error(`  kitajs : ${JSON.stringify(s.slice(i, i + 60))}`);
    process.exit(1);
  }
  return { bytes: v.length, unescaped: kitajsDefault().length };
}

/** Median, not mean: robust to GC pauses. */
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
  // Two passes in reverse order: the minimum takes the cold JIT out of the result.
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
    `identical output: ${bytes} B; without \`safe\`, kitajs produces ${unescaped} (unescaped)\n`,
  );
  group(`${ROWS}-row list: no tree built on either side`, () => {
    bench("@vincle/core (precompile, escapes)", () => void vinclePrecompile());
    bench("@kitajs/html (safe, escapes)", () => void kitajsSafe());
    bench("@kitajs/html (default, does not escape)", () => void kitajsDefault());
  });
  await run();
}
