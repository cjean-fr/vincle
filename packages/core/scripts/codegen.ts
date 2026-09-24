import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// ── Setup & Constants ───────────────────────────────────────────────────────
const here: string = dirname(fileURLToPath(import.meta.url));
const pkgRoot: string = join(here, "..");
const repoRoot: string = join(pkgRoot, "..");
const OUT: string = join(pkgRoot, "src", "jsx-namespace.ts");
const CHECK: boolean = process.argv.includes("--check");
const START: string = "// @generated:start";
const END: string = "// @generated:end";

const format = (path: string): void => {
  execFileSync("bunx", ["oxfmt", path], { cwd: repoRoot, stdio: "pipe" });
};

const require = createRequire(import.meta.url);
const reactDts: string = join(dirname(require.resolve("@types/react/package.json")), "index.d.ts");
const csstypeDts: string = join(dirname(require.resolve("csstype/package.json")), "index.d.ts");

const getPkgVersion = (dtsPath: string): string => {
  const pkgPath = join(dirname(dtsPath), "package.json");
  const content = readFileSync(pkgPath, "utf8");
  return JSON.parse(content).version ?? "unknown";
};

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const parseSource = (fileName: string, content: string): ts.SourceFile =>
  ts.createSourceFile(fileName, content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

const text: string = readFileSync(reactDts, "utf8");
const sf: ts.SourceFile = parseSource("react-index.d.ts", text);
const printer: ts.Printer = ts.createPrinter({ removeComments: true });

const nameOf = (n: ts.Node): string => n.getText(sf).replace(/^React\./, "");

// ── Collect interfaces + type aliases ───────────────────────────────────────
const interfaces = new Map<string, ts.InterfaceDeclaration>();
const aliases = new Map<string, ts.TypeAliasDeclaration>();

(function walk(n: ts.Node): void {
  if (ts.isInterfaceDeclaration(n)) interfaces.set(n.name.text, n);
  else if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n);
  ts.forEachChild(n, walk);
})(sf);

// ── 1. IntrinsicElements map ────────────────────────────────────────────────
const ie = interfaces.get("IntrinsicElements");
assert(!!ie, "IntrinsicElements interface not found in @types/react");

const tags: [string, string][] = [];
for (const m of ie.members) {
  assert(ts.isPropertySignature(m), `Invalid IE member: ${m.getText(sf)}`);
  assert(
    ts.isIdentifier(m.name) || ts.isStringLiteral(m.name),
    `Invalid IE member name: ${m.getText(sf)}`,
  );

  const tag = m.name.text;
  const tr = m.type;
  assert(!!tr && ts.isTypeReferenceNode(tr), `Invalid IE value: ${tr?.getText(sf) ?? "none"}`);

  let name = nameOf(tr.typeName);
  if (name === "DetailedHTMLProps") {
    const arg0 = tr.typeArguments?.[0];
    assert(!!arg0 && ts.isTypeReferenceNode(arg0), `DHP arg0 invalid: ${tr.getText(sf)}`);
    name = nameOf(arg0.typeName);
  }
  tags.push([tag, name]);
}

assert(tags.length > 100, `IntrinsicElements suspiciously small: ${tags.length} tags`);

// ── 2. Interface closure over heritage ─────────────────────────────────────
const DROP_IFACES = new Set(["ClassAttributes", "RefAttributes", "Attributes", "HTMLProps"]);
const needed = new Set<string>();

function closure(n: string): void {
  if (!n || needed.has(n) || DROP_IFACES.has(n)) return;
  const it = interfaces.get(n);
  assert(!!it, `Interface not found: ${n}`);
  needed.add(n);
  for (const h of it.heritageClauses ?? []) {
    for (const t of h.types) closure(nameOf(t.expression));
  }
}
for (const [, name] of tags) closure(name);

// ── 3. Type-node transformations ────────────────────────────────────────────
const isDontUse = (n: ts.Node): boolean => n.getText(sf).includes("DO_NOT_USE");

function stripDontUse(
  tn: ts.TypeNode,
  forbidden: Set<string> = new Set(["T"]),
): ts.TypeNode | null {
  if (ts.isUnionTypeNode(tn)) {
    const parts: ts.TypeNode[] = [];
    for (const t of tn.types) {
      if (isDontUse(t)) continue;
      const s = stripDontUse(t, forbidden);
      if (s) parts.push(s);
    }
    assert(parts.length > 0, `Union became empty: ${tn.getText(sf)}`);
    return parts.length === 1 ? parts[0]! : ts.factory.createUnionTypeNode(parts);
  }
  if (ts.isIndexedAccessTypeNode(tn)) {
    if (isDontUse(tn)) return null;
    return ts.factory.createIndexedAccessTypeNode(
      stripDontUse(tn.objectType, forbidden)!,
      stripDontUse(tn.indexType, forbidden)!,
    );
  }
  if (ts.isTypeReferenceNode(tn)) {
    if (isDontUse(tn)) return null;
    assert(
      !tn.typeArguments?.some((a) => a.getText(sf) === "T"),
      `Generic T leaked: ${tn.getText(sf)}`,
    );
    return tn;
  }

  const found: string[] = [];
  (function chk(x: ts.Node): void {
    if (ts.isTypeReferenceNode(x) && forbidden.has(x.typeName.getText(sf))) {
      found.push(x.getText(sf));
    }
    ts.forEachChild(x, chk);
  })(tn);

  assert(found.length === 0, `Forbidden type param: ${found.join(", ")} in ${tn.getText(sf)}`);
  return tn;
}

// ── 4. Alias closure ────────────────────────────────────────────────────────
const aliasEmit: string[] = [];
const aliasSeen = new Set<string>();

function collectRefs(tn: ts.TypeNode, into: Set<string>): void {
  (function walk(n: ts.Node): void {
    if (ts.isTypeReferenceNode(n)) {
      const nm = n.typeName.getText(sf);
      if (!nm.includes(".")) into.add(nm);
      for (const a of n.typeArguments ?? []) walk(a);
      return;
    }
    if (ts.isIndexedAccessTypeNode(n)) {
      walk(n.objectType);
      walk(n.indexType);
      return;
    }
    ts.forEachChild(n, walk);
  })(tn);
}

function ensureAlias(name: string): void {
  if (aliasSeen.has(name) || !aliases.has(name)) return;
  aliasSeen.add(name);

  const a = aliases.get(name)!;
  assert(!a.type.getText(sf).includes("DO_NOT_USE"), `Alias with DO_NOT_USE: ${name}`);

  const forbidden = new Set(["T"]);
  for (const tp of a.typeParameters ?? []) forbidden.delete(tp.name.text);

  const rhs = stripDontUse(a.type, forbidden);
  assert(!!rhs, `Alias RHS became empty: ${name}`);

  const refs = new Set<string>();
  collectRefs(rhs, refs);
  for (const r of refs) ensureAlias(r);

  const tps = a.typeParameters ? a.typeParameters.map((t) => t.getText(sf)).join(", ") : "";
  aliasEmit.push(
    `type ${a.name.text}${tps ? `<${tps}>` : ""} = ${printer.printNode(ts.EmitHint.Unspecified, rhs, sf)};`,
  );
}

// ── 4b. CSSType expansion ───────────────────────────────────────────────────
const csSf: ts.SourceFile = parseSource("csstype-index.d.ts", readFileSync(csstypeDts, "utf8"));
const csInterfaces = new Map<string, ts.InterfaceDeclaration>();
const csAliases = new Map<string, ts.TypeAliasDeclaration>();
const csNamespaces = new Map<string, Map<string, ts.TypeAliasDeclaration>>();

for (const stmt of csSf.statements) {
  if (ts.isInterfaceDeclaration(stmt)) csInterfaces.set(stmt.name.text, stmt);
  else if (ts.isTypeAliasDeclaration(stmt)) csAliases.set(stmt.name.text, stmt);
  else if (ts.isModuleDeclaration(stmt) && stmt.body && ts.isModuleBlock(stmt.body)) {
    const ns = new Map<string, ts.TypeAliasDeclaration>();
    for (const m of stmt.body.statements) {
      if (ts.isTypeAliasDeclaration(m)) ns.set(m.name.text, m);
    }
    csNamespaces.set(stmt.name.getText(csSf), ns);
  }
}

const mkType = (src: string): ts.TypeNode => {
  const probe = parseSource("probe.ts", `type Z = ${src};`);
  return (probe.statements[0] as ts.TypeAliasDeclaration).type;
};

const INSTANT = new Map<string, ts.TypeNode>([
  ["TLength", mkType("string | number")],
  ["TTime", mkType("string & {}")],
]);

const localName = (qualified: string): string => "CSS" + qualified.split(".").pop()!;

const csAliasEmit: string[] = [];
const csAliasSeen = new Set<string>();

function csCollect(tn: ts.TypeNode, context: string | null): void {
  if (ts.isUnionTypeNode(tn) || ts.isIntersectionTypeNode(tn)) {
    tn.types.forEach((t) => csCollect(t, context));
  } else if (ts.isParenthesizedTypeNode(tn)) {
    csCollect(tn.type, context);
  } else if (ts.isTypeReferenceNode(tn)) {
    const nm = tn.typeName.getText(csSf);
    if (nm === "TLength" || nm === "TTime") return;

    const qualified = context && csNamespaces.get(context)?.has(nm) ? `${context}.${nm}` : nm;
    const dot = qualified.indexOf(".");
    const ns = dot === -1 ? null : qualified.slice(0, dot);
    const name = dot === -1 ? qualified : qualified.slice(dot + 1);

    if (ns === "DataType") {
      if (csAliasSeen.has(`DataType.${name}`)) return;
      csAliasSeen.add(`DataType.${name}`);
      const a = csNamespaces.get("DataType")!.get(name)!;
      csCollect(a.type, "DataType");
      const body = flattenUnion(csExpand(a.type, new Map(INSTANT), "DataType"));
      csAliasEmit.push(
        `type ${localName(`DataType.${name}`)} = ${printer.printNode(ts.EmitHint.Unspecified, body, csSf)};`,
      );
    } else if (ns === "Property") {
      const a = csNamespaces.get("Property")!.get(name);
      if (a) csCollect(a.type, "Property");
    } else if (ns === null && csAliases.has(name)) {
      if (csAliasSeen.has(name)) return;
      csAliasSeen.add(name);
      const a = csAliases.get(name)!;
      csCollect(a.type, null);
      const body = flattenUnion(csExpand(a.type, new Map(INSTANT), null));
      csAliasEmit.push(
        `type ${localName(name)} = ${printer.printNode(ts.EmitHint.Unspecified, body, csSf)};`,
      );
    }
  }
}

function flattenUnion(tn: ts.TypeNode): ts.TypeNode {
  if (ts.isUnionTypeNode(tn)) {
    const parts: ts.TypeNode[] = [];
    (function collect(x: ts.TypeNode): void {
      if (ts.isUnionTypeNode(x)) x.types.forEach(collect);
      else if (ts.isParenthesizedTypeNode(x)) collect(x.type);
      else parts.push(x);
    })(tn);

    const uniq: ts.TypeNode[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      const t = printer.printNode(ts.EmitHint.Unspecified, p, csSf);
      if (!seen.has(t)) {
        seen.add(t);
        uniq.push(p);
      }
    }
    return uniq.length === 1 ? uniq[0]! : ts.factory.createUnionTypeNode(uniq);
  }
  if (ts.isIntersectionTypeNode(tn)) {
    return ts.factory.createIntersectionTypeNode(tn.types.map(flattenUnion));
  }
  if (ts.isParenthesizedTypeNode(tn)) return flattenUnion(tn.type);
  return tn;
}

function csExpand(
  tn: ts.TypeNode,
  subst: Map<string, ts.TypeNode>,
  context: string | null,
): ts.TypeNode {
  if (ts.isUnionTypeNode(tn))
    return ts.factory.createUnionTypeNode(tn.types.map((t) => csExpand(t, subst, context)));
  if (ts.isIntersectionTypeNode(tn))
    return ts.factory.createIntersectionTypeNode(tn.types.map((t) => csExpand(t, subst, context)));
  if (ts.isParenthesizedTypeNode(tn))
    return ts.factory.createParenthesizedType(csExpand(tn.type, subst, context));

  if (ts.isTypeReferenceNode(tn)) {
    const nm = tn.typeName.getText(csSf);
    const inst = subst.get(nm);
    if (inst) return inst;

    if (context) {
      const ctxNs = csNamespaces.get(context);
      if (ctxNs?.has(nm)) {
        if (context === "DataType") {
          assert(csAliasSeen.has(`DataType.${nm}`), `Unemitted DataType alias: ${nm}`);
          return ts.factory.createTypeReferenceNode(localName(`DataType.${nm}`));
        }
        const contextAlias = ctxNs.get(nm)!;
        const params = (contextAlias.typeParameters ?? []).map((t) => t.name.text);
        const args = tn.typeArguments ?? [];
        const next = new Map(subst);
        params.forEach((p, i) => {
          if (i < args.length) next.set(p, csExpand(args[i]!, subst, context));
          else {
            const def = contextAlias.typeParameters![i]!.default;
            assert(!!def, `CSSType param without default: ${p} in ${nm}`);
            next.set(p, csExpand(def, subst, context));
          }
        });
        return csExpand(contextAlias.type, next, context);
      }
    }

    const dot = nm.indexOf(".");
    const ns = dot === -1 ? null : nm.slice(0, dot);
    const name = dot === -1 ? nm : nm.slice(dot + 1);

    if (ns === "DataType") {
      assert(csAliasSeen.has(`DataType.${name}`), `Unemitted DataType alias: ${nm}`);
      return ts.factory.createTypeReferenceNode(localName(`DataType.${name}`));
    }
    if (ns === null && csAliases.has(name)) {
      assert(csAliasSeen.has(name), `Unemitted top-level alias: ${nm}`);
      return ts.factory.createTypeReferenceNode(localName(name));
    }
    if (ns === "Property") {
      const a = csNamespaces.get("Property")!.get(name)!;
      const params = (a.typeParameters ?? []).map((t) => t.name.text);
      const args = tn.typeArguments ?? [];
      const next = new Map(subst);
      params.forEach((p, i) => {
        if (i < args.length) next.set(p, csExpand(args[i]!, subst, "Property"));
        else {
          const def = a.typeParameters![i]!.default;
          assert(!!def, `CSSType param without default: ${p} in ${nm}`);
          next.set(p, csExpand(def, subst, "Property"));
        }
      });
      return csExpand(a.type, next, "Property");
    }
  }
  return tn;
}

const cssOrder: string[] = [];
(function cssClosure(name: string): void {
  if (cssOrder.includes(name)) return;
  const it = csInterfaces.get(name);
  if (!it) return;
  for (const h of it.heritageClauses ?? []) {
    for (const t of h.types) cssClosure(t.expression.getText(csSf));
  }
  cssOrder.push(name);
})("Properties");

for (const name of cssOrder) {
  for (const m of csInterfaces.get(name)!.members) {
    if (ts.isPropertySignature(m) && m.type) csCollect(m.type, null);
  }
}

const cssProps = new Map<string, [boolean, string]>();
for (const name of cssOrder) {
  const it = csInterfaces.get(name)!;
  for (const m of it.members) {
    assert(ts.isPropertySignature(m), `CSS member invalid: ${m.getText(csSf)}`);
    assert(ts.isIdentifier(m.name), `CSS prop name invalid: ${m.getText(csSf)}`);
    assert(!!m.type, `CSS missing type: ${m.name.text}`);
    const t = flattenUnion(csExpand(m.type, new Map(INSTANT), null));
    cssProps.set(m.name.text, [
      !!m.questionToken,
      printer.printNode(ts.EmitHint.Unspecified, t, csSf),
    ]);
  }
}
assert(cssProps.size > 800, `CSSType expansion suspiciously small: ${cssProps.size}`);

// Property types are emitted inline. The `CSS*` aliases above already carry the
// shared vocabulary (`CSSColor`, `CSSLineWidth`) under names a reader
// recognises; a second layer keyed on the printed text would save ~400 B gzip
// and spend it on every CSS error message, which would then name a generated
// number instead of the values the property accepts. The longest inline type is
// ~100 chars, short of the width at which TypeScript elides a union.

// ── 5. Interface Emission ───────────────────────────────────────────────────
const STRIP = new Set([
  "ref",
  "suppressHydrationWarning",
  "suppressContentEditableWarning",
  "defaultChecked",
  "defaultValue",
  "radioGroup",
  "autoSave",
  "results",
  "security",
  "classID",
  "unselectable",
]);
const OVERRIDES = new Set([
  "key",
  "class",
  "className",
  "children",
  "style",
  "dangerouslySetInnerHTML",
  "htmlFor",
]);
const BASE_OVERRIDES: string[] = [
  "key?: string | number | bigint | null | undefined;",
  "class?: Awaitable<ClassValue>;",
  "className?: Awaitable<ClassValue>;",
  "children?: Renderable;",
  "style?: Awaitable<string | CSSProperties | RawString | null | undefined>;",
  "dangerouslySetInnerHTML?: { __html: string | null | undefined };",
  "htmlFor?: Awaitable<string | null | undefined>;",
  "for?: Awaitable<string | null | undefined>;",
  "[K: `on${string}`]: Awaitable<string> | undefined;",
];

// React supplies the source vocabulary, but Vincle renders HTML. Expose the
// native spelling alongside each React spelling so examples can use HTML names.
function nativeHTMLName(name: string): string | undefined {
  if (!/[A-Z]/.test(name)) return undefined;
  if (name === "acceptCharset") return "accept-charset";
  if (name === "httpEquiv") return "http-equiv";
  return name.toLowerCase();
}

const SVG_KEEP = new Set([
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "d",
  "points",
  "path",
  "pathLength",
  "transform",
  "viewBox",
  "preserveAspectRatio",
  "refX",
  "refY",
  "from",
  "to",
  "by",
  "offset",
  "fx",
  "fy",
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeOpacity",
  "strokeWidth",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "color",
  "colorInterpolation",
  "colorInterpolationFilters",
  "opacity",
  "paintOrder",
  "floodColor",
  "floodOpacity",
  "lightingColor",
  "stopColor",
  "stopOpacity",
  "spreadMethod",
  "gradientTransform",
  "gradientUnits",
  "patternUnits",
  "patternTransform",
  "patternContentUnits",
  "maskUnits",
  "maskContentUnits",
  "clipPathUnits",
  "clipPath",
  "clipRule",
  "mask",
  "filter",
  "filterUnits",
  "primitiveUnits",
  "pointerEvents",
  "shapeRendering",
  "textRendering",
  "imageRendering",
  "display",
  "visibility",
  "cursor",
  "overflow",
  "vectorEffect",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "textAnchor",
  "textDecoration",
  "wordSpacing",
  "writingMode",
  "dominantBaseline",
  "alignmentBaseline",
  "baselineShift",
  "textLength",
  "lengthAdjust",
  "attributeName",
  "begin",
  "dur",
  "end",
  "repeatCount",
  "restart",
  "values",
  "keyTimes",
  "keySplines",
  "calcMode",
  "additive",
  "accumulate",
  "numOctaves",
  "seed",
  "baseFrequency",
  "stdDeviation",
  "in",
  "in2",
  "result",
  "mode",
  "operator",
  "markerStart",
  "markerMid",
  "markerEnd",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "orient",
  "id",
  "role",
  "tabIndex",
  "href",
  "xmlns",
]);

function emitInterface(name: string): string {
  const it = interfaces.get(name)!;
  const heritage: string[] = [];
  for (const h of it.heritageClauses ?? []) {
    for (const t of h.types) {
      const hn = nameOf(t.expression);
      if (!DROP_IFACES.has(hn)) heritage.push(hn);
    }
  }

  const props: string[] = [];
  if (name === "DOMAttributes") props.push(...BASE_OVERRIDES);

  const aliasRefs = new Set<string>();
  for (const m of it.members) {
    assert(ts.isPropertySignature(m), `${name} member invalid: ${m.getText(sf)}`);
    assert(
      ts.isIdentifier(m.name) || ts.isStringLiteral(m.name),
      `Prop name invalid: ${m.getText(sf)}`,
    );

    const pn = m.name.text;
    if (STRIP.has(pn) || OVERRIDES.has(pn) || pn.startsWith("on")) continue;
    if (name === "SVGAttributes" && !SVG_KEEP.has(pn)) continue;

    assert(!!m.type, `No type on prop: ${pn}`);
    const t = stripDontUse(m.type);
    assert(!!t, `Prop type became empty: ${pn}`);

    collectRefs(t, aliasRefs);
    const key = ts.isIdentifier(m.name) ? pn : JSON.stringify(pn);
    props.push(
      `${key}${m.questionToken ? "?" : ""}: Awaitable<${printer.printNode(
        ts.EmitHint.Unspecified,
        t,
        sf,
      )} | RawString>;`,
    );
    if (name !== "SVGAttributes") {
      const nativeName = nativeHTMLName(pn);
      if (nativeName !== undefined) {
        // HTML's serialized spelling accepts numeric strings for numeric
        // React props. Keep the React alias strict, while constraining the
        // native spelling to strings that actually parse as numbers.
        const printedType = printer.printNode(ts.EmitHint.Unspecified, t, sf);
        const nativeType =
          nativeName === "tabindex"
            ? "number | `${bigint}`"
            : printedType.replace(/\bnumber\b/g, "number | `${number}`");
        props.push(
          `${JSON.stringify(nativeName)}${m.questionToken ? "?" : ""}: Awaitable<${nativeType} | RawString>;`,
        );
      }
    }
  }

  if (name === "SVGAttributes") {
    const present = new Set<string>();
    for (const m of it.members) {
      if (ts.isPropertySignature(m) && m.name) present.add(m.name.getText(sf));
    }
    for (const k of SVG_KEEP) assert(present.has(k), `SVG_KEEP missing in @types/react: ${k}`);
  }

  for (const r of aliasRefs) ensureAlias(r);

  const header = `export interface ${name}${heritage.length ? " extends " + heritage.join(", ") : ""} {`;
  return [header, ...props.map((p) => "  " + p), "}"].join("\n");
}

// ── 6. Assembly ─────────────────────────────────────────────────────────────
const order: string[] = [];
const seen = new Set<string>();

const baseInterfaces = [
  "AriaAttributes",
  "DOMAttributes",
  "HTMLAttributes",
  "AllHTMLAttributes",
  "MediaHTMLAttributes",
  "BaseHTMLAttributes",
];

for (const n of baseInterfaces) {
  if (needed.has(n)) {
    order.push(n);
    seen.add(n);
  }
}
for (const [, name] of tags) {
  if (needed.has(name) && !seen.has(name)) {
    order.push(name);
    seen.add(name);
  }
}
const svgInterfaces = [
  "SVGAttributes",
  "SVGProps",
  "SVGLineElementAttributes",
  "SVGTextElementAttributes",
];
for (const n of svgInterfaces) {
  if (needed.has(n) && !seen.has(n)) {
    order.push(n);
    seen.add(n);
  }
}
for (const n of needed) assert(seen.has(n), `Not emitted: ${n}`);

const ifaceBlocks: string[] = order.map(emitInterface);
const reactVersion = getPkgVersion(reactDts);
const csstypeVersion = getPkgVersion(csstypeDts);

const cssBlock: string[] = [
  ...csAliasEmit,
  ...(csAliasEmit.length ? [""] : []),
  "export type CSSProperties = {",
  ...[...cssProps.entries()].map(([k, [opt, v]]) => `  ${k}${opt ? "?" : ""}: ${v};`),
  "} & { [key: `--${string}`]: string | number | undefined };",
];

const tableBlock: string[] = [
  `/* Intrinsic table: generated from @types/react ${reactVersion} + csstype ${csstypeVersion} by scripts/codegen.ts. Do not edit. */`,
  ...aliasEmit,
  "",
  ...ifaceBlocks,
  "",
  "/**",
  " * What an intrinsic element accepts.",
  " */",
  "export interface IntrinsicElements {",
  "  [K: `${string}-${string}`]: Record<string, unknown> & { children?: Renderable };",
  ...tags.map(([tag, name]) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tag) ? tag : JSON.stringify(tag);
    return `  ${key}: ${name};`;
  }),
  "}",
];

// ── 7. Splice source ────────────────────────────────────────────────────────
const file: string = readFileSync(OUT, "utf8");
const lines: string[] = file.split("\n");
const regions: [number, number][] = [];

for (let i = 0; i < lines.length; i++) {
  if (lines[i]!.trim() === START) {
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() !== END) j++;
    assert(j < lines.length, `Unterminated @generated region at line ${i + 1}`);
    regions.push([i + 1, j]);
    i = j;
  }
}
assert(regions.length === 2, `Expected 2 @generated regions, found ${regions.length}`);

const [cssAt, cssEnd] = regions[0]!;
const [tableAt, tableEnd] = regions[1]!;
assert(cssAt < cssEnd && tableAt < tableEnd && cssEnd <= tableAt, "Regions overlap or misordered");

const indent2 = (b: string[]): string[] => b.map((l) => (l ? "  " + l : ""));
const content: string = [
  ...lines.slice(0, cssAt),
  ...cssBlock,
  ...lines.slice(cssEnd, tableAt),
  ...indent2(tableBlock),
  ...lines.slice(tableEnd),
].join("\n");

if (CHECK) {
  // Inside the package, so `oxfmt` resolves the same config it would for OUT,
  // and dot-prefixed, so a run killed between the write and the `finally`
  // leaves nothing `tsc` picks up or `files` publishes.
  const tmp: string = join(pkgRoot, `.codegen-check-${Date.now()}.tmp.ts`);
  writeFileSync(tmp, content);
  let formatted: string;
  try {
    format(tmp);
    formatted = readFileSync(tmp, "utf8");
  } finally {
    rmSync(tmp, { force: true });
  }
  if (file !== formatted) {
    const was = file.split("\n");
    const now = formatted.split("\n");
    let i = 0;
    while (i < was.length && i < now.length && was[i] === now[i]) i++;
    console.error(
      `STALE: src/jsx-namespace.ts does not match @types/react ${reactVersion} + csstype ${csstypeVersion}`,
    );
    console.error(`First difference at line ${i + 1}:`);
    console.error(`  committed: ${was[i] ?? "<end of file>"}`);
    console.error(`  generated: ${now[i] ?? "<end of file>"}`);
    console.error("Run: bun scripts/codegen.ts");
    process.exit(1);
  }
  console.log(
    `OK fresh (tags=${tags.length}, interfaces=${order.length}, aliases=${aliasEmit.length})`,
  );
} else {
  writeFileSync(OUT, content);
  format(OUT);
  console.log(
    `OK wrote ${OUT} (tags=${tags.length}, interfaces=${order.length}, aliases=${aliasEmit.length})`,
  );
}
