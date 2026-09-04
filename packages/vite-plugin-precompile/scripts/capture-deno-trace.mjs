/**
 * Regenerate `test-fixtures/deno-precompile-trace.json` — the reference output
 * of Deno's own `jsx: "precompile"` transform, which `compatibility: true` is
 * measured against.
 *
 * Requires Deno on PATH; the test that consumes the fixture does not. Run it
 * when raising the Deno version the fixture claims, and record what came out:
 *
 *   bun run scripts/capture-deno-trace.mjs
 *
 * The trace is what the transform *did* — every helper call in order, with the
 * names it chose, plus the static fragments — not just the rendered HTML. A
 * name resolved differently is a divergence even when the page looks the same.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRELUDE = [
  `const c = "C"; const f = "F"; const b = true; const h = "H"; const a = "A";`,
  `const d = "D"; const s = "S"; const name = "N"; const css = "CSS";`,
  `const p = { z: 1 };`,
  `const Foo = (q) => null;`,
].join("\n");

const CASES = [
  ["statique", `<div class="box" id="x">hi</div>`],
  ["alias statique", `<div className="box" tabIndex="0">hi</div>`],
  ["alias dynamique", `<div className={c} htmlFor={f}>x</div>`],
  ["booleen statique", `<input readOnly />`],
  ["booleen dynamique", `<input readOnly={b} />`],
  ["disabled dynamique", `<input disabled={b} />`],
  ["xlink dynamique", `<use xlinkHref={h} />`],
  ["xlink statique", `<use xlinkHref="#i" />`],
  ["xmlns", `<svg xmlnsXlink="u" />`],
  ["aria + data", `<div aria-hidden={a} data-x={d}>x</div>`],
  ["onClick dynamique", `<button onClick={h}>x</button>`],
  ["style dynamique", `<div style={s}>x</div>`],
  ["hole texte", `<p>{name}</p>`],
  ["plusieurs holes", `<p>{a}{b}</p>`],
  ["composant", `<div><Foo x={1} /></div>`],
  ["spread", `<div {...p}>x</div>`],
  ["innerHTML", `<div dangerouslySetInnerHTML={h} />`],
  ["rawtext hole", `<style>{css}</style>`],
  ["void dynamique", `<img src={s} alt="a" />`],
  ["texte final", `<span>a </span>`],
  ["texte bordé", `<div>  a  </div>`],
  ["multi-ligne", `<div>  a\n   b  </div>`],
  ["tabulations", `<div>\ta\t</div>`],
  ["fragment", `<><li>one</li><li>two</li></>`],
  ["entités", `<p>fish &amp; chips &copy;</p>`],
  ["rawtext statique", `<style>.a &gt; .b</style>`],
];

const SPY = `export const seen: string[] = [];
export const mark = (i: number): number => (seen.push(\`— case \${i}\`), i);
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
  const marker = /^— case (\d+)$/.exec(line);
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
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`${version} → ${CASES.length} cas écrits dans ${out}`);
