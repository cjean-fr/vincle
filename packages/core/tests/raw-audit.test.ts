/**
 * `RawString` audit: no implicit trusted markup.
 *
 * A `RawString` is emitted verbatim, so every place the production code builds
 * one is a place where escaping can be skipped. Each site is declared here with
 * where its text comes from, and the production sources are parsed to check
 * the declarations against the code: adding, moving or removing a site fails
 * this test until the inventory says why the new text is already safe.
 *
 * The test proves the inventory is complete, not that each justification is
 * true: that part stays a review, which this test makes impossible to skip.
 *
 * @see apps/docs/src/pages/guide/security.mdx (I‑07).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSync } from "oxc-parser";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

interface RawSite {
  /** Path relative to the package root, as the source scan reports it. */
  file: string;
  /** The top-level function or binding the site sits in. */
  scope: string;
  /** `new RawString(…)`, or the `raw` factory called or passed by reference. */
  kind: "new" | "raw";
  /** How many such sites that scope holds. */
  count: number;
  /** Where the text comes from, and why it is already markup. */
  origin: string;
}

const AUDITED: RawSite[] = [
  {
    file: "src/types.ts",
    scope: "raw",
    kind: "new",
    count: 1,
    origin: "The public opt-in: the caller vouches for the markup (guide/security, `raw()` audit).",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "jsx",
    kind: "raw",
    count: 2,
    origin: '`dangerouslySetInnerHTML.__html`: the React opt-in, a string or nothing (`raw("")`).',
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "jsxEscape",
    kind: "new",
    count: 2,
    origin: "`escapeContent` for a string, `valueToText` (which escapes) for any other leaf.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "jsxEscapeDeferred",
    kind: "new",
    count: 2,
    origin: "The output of `renderNode`: the tree walk, which escapes every leaf it emits.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "escapeArray",
    kind: "new",
    count: 1,
    origin: "Concatenation of `RawString` values and `valueToText` leaves.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "escapeArrayFrom",
    kind: "new",
    count: 1,
    origin: "Concatenation of `renderValue` parts: the async tail of `escapeArray`.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "renderTemplate",
    kind: "new",
    count: 2,
    origin:
      "Compiler-emitted static templates joined with holes that are `RawString`, `valueToText` or `renderElementAttr` output.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "jsxTemplateDeferred",
    kind: "new",
    count: 2,
    origin: "Static templates around one hole rendered by `renderNode` or a `TemplateNode`.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "resumeAfter",
    kind: "raw",
    count: 1,
    origin: "The resolved text of `renderElementAttr`: a serialized attribute.",
  },
  {
    file: "src/jsx-runtime.ts",
    scope: "renderTemplateAsync",
    kind: "new",
    count: 2,
    origin:
      "Static templates joined with holes rendered by `renderAt` (attribute, tree walk, leaf).",
  },
  {
    file: "src/serialize.ts",
    scope: "serializeStatic",
    kind: "new",
    count: 2,
    origin: "A validated tag, `buildAttrs` output and `serializeContent` children: one element.",
  },
  {
    file: "src/attrs.ts",
    scope: "serializeAttr",
    kind: "new",
    count: 1,
    origin: "`soloFragment`: one attribute, name validated and value escaped.",
  },
  {
    file: "src/attrs.ts",
    scope: "serializeTemplateAttr",
    kind: "new",
    count: 1,
    origin: "`soloFragment`, as `serializeAttr`: the precompile path's attribute.",
  },
];

/**
 * Stryker rewrites every source file with its own scaffolding, which this scan
 * would read as code: on instrumented sources the comparison is skipped.
 */
const INSTRUMENTED_MARKER = "stryMutAct_";

const identify = (s: { file: string; scope: string; kind: string }): string =>
  `${s.file} ${s.scope} ${s.kind}`;

/** Every `RawString` construction and `raw` use in the production sources, per scope. */
function scanSources(): { found: Map<string, number>; instrumented: boolean } {
  const files = [
    "index.ts",
    ...[...new Bun.Glob("src/**/*.ts").scanSync(PACKAGE_ROOT)].filter(
      (f) => !f.endsWith(".test.ts"),
    ),
  ].toSorted();

  const found = new Map<string, number>();
  let instrumented = false;
  const count = (file: string, scope: string, kind: string): void => {
    const id = identify({ file, scope, kind });
    found.set(id, (found.get(id) ?? 0) + 1);
  };

  for (const file of files) {
    const text = readFileSync(join(PACKAGE_ROOT, file), "utf8");
    if (text.includes(INSTRUMENTED_MARKER)) instrumented = true;
    const ast = parseSync(file, text);
    expect(ast.errors).toEqual([]);

    // An import may rename either binding: match the local name it gets.
    const ctor = new Set(["RawString"]);
    const factory = new Set(["raw"]);
    for (const stmt of ast.program.body as any[]) {
      if (stmt.type !== "ImportDeclaration") continue;
      for (const spec of stmt.specifiers) {
        if (spec.imported?.name === "RawString") ctor.add(spec.local.name);
        if (spec.imported?.name === "raw") factory.add(spec.local.name);
      }
    }

    // A top-level declaration names the scope; anything nested inherits it.
    const walk = (node: unknown, scope: string, atTop: boolean): void => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, scope, atTop);
        return;
      }
      const n = node as Record<string, any>;
      let inner = scope;
      let nested = atTop;
      if (atTop) {
        const name =
          n["type"] === "FunctionDeclaration" || n["type"] === "ClassDeclaration"
            ? n["id"]?.name
            : n["type"] === "VariableDeclarator"
              ? n["id"]?.name
              : undefined;
        if (name) {
          inner = name;
          nested = false;
        }
      }
      if (n["type"] === "NewExpression" && ctor.has(n["callee"]?.name)) {
        count(file, inner, "new");
      }
      if (n["type"] === "CallExpression") {
        if (n["callee"]?.type === "Identifier" && factory.has(n["callee"].name)) {
          count(file, inner, "raw");
        }
        for (const arg of n["arguments"]) {
          if (arg.type === "Identifier" && factory.has(arg.name)) count(file, inner, "raw");
        }
      }
      for (const key in n) {
        if (key !== "type") walk(n[key], inner, nested);
      }
    };
    walk(ast.program, "<module>", true);
  }

  return { found, instrumented };
}

describe("RawString inventory is derived from the source, not from memory", () => {
  const { found, instrumented } = scanSources();
  const onPristineSource = instrumented ? it.skip : it;

  onPristineSource("every site in production code is audited, with its count", () => {
    const declared = new Map(AUDITED.map((s) => [identify(s), s.count]));
    const mismatched = [...found]
      .filter(([id, n]) => declared.get(id) !== n)
      .map(([id, n]) => `${id} ×${n} (declared ×${declared.get(id) ?? 0})`);
    expect(
      mismatched,
      "a new or moved RawString site must be declared in AUDITED, with where its text comes from",
    ).toEqual([]);
  });

  onPristineSource("every audited entry still exists in the source", () => {
    const stale = AUDITED.filter((s) => !found.has(identify(s))).map(identify);
    expect(stale, "remove entries that no longer exist").toEqual([]);
  });

  it("no duplicate declarations, and every entry states its origin", () => {
    const ids = AUDITED.map(identify);
    expect(new Set(ids).size).toBe(ids.length);
    for (const site of AUDITED) expect(site.origin.length).toBeGreaterThan(0);
  });
});
