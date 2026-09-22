/**
 * Regenerate `test-fixtures/deno-precompile-trace.json`: the reference output
 * of Deno's own `jsx: "precompile"` transform, which `compatibility: true` is
 * measured against.
 *
 * Requires Deno on PATH; the test that consumes the fixture does not. Run it
 * when raising the Deno version the fixture claims, and record what came out:
 *
 *   bun run scripts/capture-deno-trace.mjs
 *
 * `--check` compares instead of writing, and exits non-zero on any difference.
 * That is what the drift workflow runs against whatever Deno is current: the
 * fixture stays pinned for pull requests, so their CI needs no Deno and a
 * change in Deno arrives as a reviewable diff rather than a red build on an
 * unrelated commit.
 *
 * The trace is what the transform *did*: every helper call in order, with the
 * names it chose, plus the static fragments, not just the rendered HTML. A
 * name resolved differently is a divergence even when the page looks the same.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRELUDE = [
  `const c = "C"; const f = "F"; const b = true; const h = "H"; const a = "A";`,
  `const d = "D"; const s = "S"; const name = "N"; const css = "CSS";`,
  `const p = { z: 1 };`,
  `const Foo = (q) => null;`,
  `const Ctx = { Provider: (q) => null };`,
].join("\n");

const CASES = [
  ["static", `<div class="box" id="x">hi</div>`],
  ["static alias", `<div className="box" tabIndex="0">hi</div>`],
  ["dynamic alias", `<div className={c} htmlFor={f}>x</div>`],
  ["static boolean", `<input readOnly />`],
  ["dynamic boolean", `<input readOnly={b} />`],
  ["dynamic disabled", `<input disabled={b} />`],
  ["dynamic xlink", `<use xlinkHref={h} />`],
  ["static xlink", `<use xlinkHref="#i" />`],
  ["xmlns", `<svg xmlnsXlink="u" />`],
  ["aria + data", `<div aria-hidden={a} data-x={d}>x</div>`],
  ["dynamic onClick", `<button onClick={h}>x</button>`],
  ["dynamic style", `<div style={s}>x</div>`],
  ["text hole", `<p>{name}</p>`],
  ["several holes", `<p>{a}{b}</p>`],
  ["component", `<div><Foo x={1} /></div>`],
  ["provider + component", `<Ctx.Provider value="en"><div><Foo x={1} /></div></Ctx.Provider>`],
  ["provider + text template", '<Ctx.Provider value="en"><p>{`${name}:${d}`}</p></Ctx.Provider>'],
  ["spread", `<div {...p}>x</div>`],
  ["innerHTML", `<div dangerouslySetInnerHTML={h} />`],
  ["rawtext hole", `<style>{css}</style>`],
  ["dynamic void", `<img src={s} alt="a" />`],
  ["trailing text", `<span>a </span>`],
  ["padded text", `<div>  a  </div>`],
  ["multi-line", `<div>  a\n   b  </div>`],
  ["tabs", `<div>\ta\t</div>`],
  ["fragment", `<><li>one</li><li>two</li></>`],
  ["entities", `<p>fish &amp; chips &copy;</p>`],
  ["static rawtext", `<style>.a &gt; .b</style>`],
];

const SPY = `export const seen: string[] = [];
export const mark = (i: number): number => (seen.push(\`- case \${i}\`), i);
export function jsxTemplate(templates: string[], ...values: unknown[]): string {
  seen.push(\`tpl \${JSON.stringify(templates)} holes=\${values.length}\`);
  return "T";
}
export function jsxAttr(name: string, value: unknown): string {
  seen.push(\`attr \${JSON.stringify(name)}\`);
  return value == null ? "" : \`\${name}="\${String(value)}"\`;
}
export function jsxEscape(v: unknown): string {
  seen.push("escape");
  return v == null ? "" : String(v);
}
export function jsx(): string {
  seen.push("jsx");
  return "J";
}
export const Fragment = "F";
`;

const dir = mkdtempSync(join(tmpdir(), "deno-trace-"));
writeFileSync(join(dir, "jsx-runtime.ts"), SPY);
writeFileSync(
  join(dir, "deno.json"),
  JSON.stringify(
    {
      imports: { "spy/jsx-runtime": "./jsx-runtime.ts" },
      compilerOptions: { jsx: "precompile", jsxImportSource: "spy" },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(dir, "page.tsx"),
  [
    `import { mark } from "./jsx-runtime.ts";`,
    PRELUDE,
    ...CASES.map(([, jsx], i) => `export const m${i} = mark(${i});\nexport const c${i} = ${jsx};`),
    `import { seen } from "./jsx-runtime.ts";`,
    `console.log(JSON.stringify(seen));`,
  ].join("\n"),
);

const version = execFileSync("deno", ["--version"], { encoding: "utf8" }).split("\n")[0].trim();
const raw = execFileSync("deno", ["run", "--allow-read", "page.tsx"], {
  cwd: dir,
  encoding: "utf8",
});
const trace = JSON.parse(raw.trim().split("\n").at(-1));

const byCase = new Map();
let current = -1;
for (const line of trace) {
  const marker = /^- case (\d+)$/.exec(line);
  if (marker) {
    current = Number(marker[1]);
    byCase.set(current, []);
    continue;
  }
  byCase.get(current)?.push(line);
}

const fixture = {
  source: version,
  prelude: PRELUDE,
  cases: CASES.map(([label, jsx], i) => ({ label, jsx, trace: byCase.get(i) ?? [] })),
};
const out = new URL("../test-fixtures/deno-precompile-trace.json", import.meta.url).pathname;
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

if (!process.argv.includes("--check")) {
  writeFileSync(out, serialized);
  console.log(`${version} → ${CASES.length} cases written to ${out}`);
  process.exit(0);
}

const pinned = JSON.parse(readFileSync(out, "utf8"));
const drifted = fixture.cases.filter(
  (c, i) => JSON.stringify(c.trace) !== JSON.stringify(pinned.cases[i]?.trace),
);

if (drifted.length === 0) {
  console.log(
    pinned.source === version
      ? `${version} matches the fixture.`
      : `${version} matches the fixture, captured with ${pinned.source}: bump the recorded version.`,
  );
  process.exit(0);
}

console.error(
  `${version} no longer emits what the fixture recorded (${pinned.source}).\n` +
    `${drifted.length} of ${CASES.length} cases changed:\n`,
);
for (const c of drifted) {
  const before = pinned.cases.find((p) => p.label === c.label)?.trace ?? [];
  console.error(`  ${c.label}  ${c.jsx}`);
  console.error(`    was: ${JSON.stringify(before)}`);
  console.error(`    now: ${JSON.stringify(c.trace)}`);
}
console.error(
  "\nThe compatibility path promises this output, so a change here is a decision:\n" +
    "follow it (rerun without --check and adjust the transform) or record why not.",
);
process.exit(1);
