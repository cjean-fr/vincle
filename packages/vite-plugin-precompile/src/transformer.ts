import {
  collapseJsxWhitespace,
  escapeAttr,
  hasSpreadOrInnerHTML,
  isEventHandlerName,
  isLowercaseTag,
  isVoidElement,
  remapAttrName,
  RUNTIME_SOURCE,
} from "@vincle/precompile-core";
import type {
  Expression,
  ImportDeclaration,
  JSXAttribute,
  JSXAttributeItem,
  JSXChild,
  JSXElement,
  JSXFragment,
  JSXIdentifier,
  Program,
} from "@oxc-project/types";
import MagicString from "magic-string";
import { parseSync, visitorKeys } from "oxc-parser";

export interface PluginConfig {
  runtimeSource?: string;
  /**
   * When `true`, static attributes are sanitized at build time by running them
   * through the runtime's own attribute serializer (`renderAttr`) instead of
   * being inlined verbatim. This mirrors what the runtime does for dynamic
   * values (URL-scheme blocking, unsafe-CSS dropping, name remapping). The
   * default (`false`) matches Deno's precompile: static attributes are trusted
   * and inlined, keeping them fully static. The Vite plugin wires `renderAttr`
   * up automatically from `runtimeSource`.
   */
  secure?: boolean;
}

/**
 * Build-time attribute serializer — the runtime's `jsxAttr`. Injected by the
 * Vite plugin (loaded from `runtimeSource`) when `secure` is on, so the
 * transformer itself stays dependency-free and synchronous. For a static
 * string/boolean value `jsxAttr` always returns synchronously.
 *
 * The runtime wraps the result in a `RawString` to signal it's already-escaped
 * HTML; the transformer handles both the raw string (legacy) and `RawString`
 * (current) forms by inspecting the `.value` property.
 */
export type RenderAttr = (
  name: string,
  value: unknown,
) => string | { value: string } | Promise<string | { value: string }>;

export interface TransformResult {
  code: string;
  map?: ReturnType<MagicString["generateMap"]>;
}

/**
 * Per-file transform state shared by every emit helper.
 *
 * `source` is the original module text (used for span slicing); `used`
 * accumulates the set of runtime helpers the rewritten code references so the
 * matching import can be injected once at the end.
 */
interface Ctx {
  source: string;
  used: Set<string>;
  /** Present only in secure mode; sanitizes static attributes at build time. */
  renderAttr: RenderAttr | null;
}

/** Minimal structural view of an oxc AST node for generic traversal. */
interface AnyNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/**
 * Walk the visitor keys of an AST node, invoking `visit` for each child.
 * Returns `true` if any visit call returned `true` (early termination).
 */
function walkChildren(
  node: AnyNode,
  visit: (child: AnyNode) => boolean,
): boolean {
  for (const key of visitorKeys[node.type] ?? []) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && "type" in item) {
          if (visit(item as AnyNode)) return true;
        }
      }
    } else if (val && typeof val === "object" && "type" in val) {
      if (visit(val as AnyNode)) return true;
    }
  }
  return false;
}

export default function precompileTransform(
  code: string,
  id: string,
  config?: PluginConfig,
  renderAttr?: RenderAttr,
): TransformResult | null {
  const rtSource = config?.runtimeSource ?? RUNTIME_SOURCE;
  const lang = id.endsWith(".tsx") ? "tsx" : "jsx";

  const result = parseSync(id, code, {
    lang,
    sourceType: "unambiguous",
    range: true,
    preserveParens: false,
  });

  if (result.errors.length > 0) {
    const isCritical = result.errors.some(
      (e: { severity: string }) => e.severity === "Error",
    );
    if (isCritical) return null;
  }

  const program = result.program as Program;
  const ctx: Ctx = {
    source: code,
    used: new Set<string>(),
    renderAttr: config?.secure ? (renderAttr ?? null) : null,
  };
  const replacements: Replacement[] = [];

  for (const stmt of program.body) {
    collectNode(stmt as unknown as AnyNode, ctx, replacements);
  }

  if (replacements.length === 0) return null;

  const s = new MagicString(code);
  for (const r of replacements) s.overwrite(r.start, r.end, r.text);
  // Inject the import through the same MagicString, BEFORE generateMap —
  // a post-hoc string splice would shift every line below it out of the map.
  injectRuntimeImport(s, program, code, rtSource, [...ctx.used]);

  if (!s.hasChanged()) return null;
  return {
    code: s.toString(),
    map: s.generateMap({ hires: "boundary", source: id, includeContent: true }),
  };
}

/**
 * Walk the tree looking for top-level precompilable JSX. When an eligible
 * element/fragment is found it is replaced wholesale (children are inlined by
 * `transformElement`/`transformFragment`), so we do NOT descend into it — that
 * would produce overlapping replacements. Anything else is traversed so nested
 * host elements (e.g. inside a component) are still picked up.
 */
function collectNode(
  node: AnyNode,
  ctx: Ctx,
  replacements: Replacement[],
): void {
  if (node.type === "JSXElement") {
    const el = node as unknown as JSXElement;
    if (isEligibleElement(el)) {
      replacements.push({
        start: el.start,
        end: el.end,
        text: transformElement(el, ctx),
      });
      return;
    }
  } else if (node.type === "JSXFragment") {
    const frag = node as unknown as JSXFragment;
    replacements.push({
      start: frag.start,
      end: frag.end,
      text: transformFragment(frag, ctx),
    });
    return;
  }

  walkChildren(node, (child) => {
    collectNode(child, ctx, replacements);
    return false;
  });
}

function isEligibleElement(node: JSXElement): boolean {
  const name = node.openingElement.name;
  if (name.type !== "JSXIdentifier") return false;
  if (!isLowercaseTag(name.name)) return false;
  return !hasSpreadOrInnerHTML(
    node.openingElement.attributes.map((a) => {
      if (a.type === "JSXSpreadAttribute") return { kind: "spread" as const };
      return { kind: "attribute" as const, name: attrName(a) };
    }),
  );
}

function attrName(attr: JSXAttribute): string {
  if (attr.name.type === "JSXIdentifier") return attr.name.name;
  // JSXNamespacedName: both `namespace` and `name` are JSXIdentifier nodes, so
  // the local part is `attr.name.name.name`, not `attr.name.name` (which would
  // stringify to "[object Object]" and corrupt e.g. `xlink:href`).
  return `${attr.name.namespace.name}:${attr.name.name.name}`;
}

function transformElement(node: JSXElement, ctx: Ctx): string {
  ctx.used.add("jsxTemplate");
  const tag = (node.openingElement.name as JSXIdentifier).name;
  const parts: string[] = [""];
  const exprs: string[] = [];

  emitOpening(tag, node.openingElement.attributes, parts, exprs, ctx);
  if (!isVoidElement(tag)) {
    emitChildren(node.children, parts, exprs, ctx);
    appendStatic(parts, `</${tag}>`);
  }

  return buildTaggedTemplate(parts, exprs);
}

function transformFragment(node: JSXFragment, ctx: Ctx): string {
  ctx.used.add("jsxTemplate");
  const parts: string[] = [""];
  const exprs: string[] = [];
  emitChildren(node.children, parts, exprs, ctx);
  return buildTaggedTemplate(parts, exprs);
}

function emitOpening(
  tag: string,
  attrs: JSXAttributeItem[],
  parts: string[],
  exprs: string[],
  ctx: Ctx,
  closingBracket = ">",
): void {
  appendStatic(parts, `<${tag}`);

  for (const attr of attrs) {
    if (attr.type === "JSXAttribute") {
      emitAttribute(attr, parts, exprs, ctx);
    } else {
      throw new Error(
        "[vite-plugin-precompile] internal: spread attribute reached emitOpening — isEligibleElement should have rejected this element",
      );
    }
  }

  appendStatic(parts, closingBracket);
}

function emitAttribute(
  attr: JSXAttribute,
  parts: string[],
  exprs: string[],
  ctx: Ctx,
): void {
  const rawName = attrName(attr);
  const init = attr.value;

  // Boolean attribute (no value): <input disabled />, <input readOnly />.
  if (init === null) {
    emitStaticAttr(rawName, true, parts, ctx);
    return;
  }

  // Static string literal: class="x", title="hi".
  if (init.type === "Literal") {
    emitStaticAttr(rawName, init.value, parts, ctx);
    return;
  }

  // Dynamic value: always handled by the runtime, which does its own name
  // remapping, sanitization, and drop-if-unsafe logic.
  if (init.type === "JSXExpressionContainer") {
    const expr = init.expression;
    if (expr.type !== "JSXEmptyExpression") {
      ctx.used.add("jsxAttr");
      const exprText = processExpressionForJsx(expr, ctx);
      addDynamic(
        parts,
        exprs,
        `jsxAttr(${JSON.stringify(rawName)}, ${exprText})`,
      );
      return;
    }
    appendStatic(parts, ` ${remapAttrName(rawName)}=""`);
  }
}

/**
 * Emit a statically-known attribute (a boolean flag or a string literal).
 *
 * Default (Deno-aligned): static attributes are trusted and inlined. The name
 * is remapped to its HTML form (`className` → `class`, `tabIndex` →
 * `tabindex`), event-handler names are lowercased (`onClick` → `onclick`), and
 * the value is HTML-escaped. No value sanitization is applied — that is the
 * runtime's job for *dynamic* values, which always go through `jsxAttr`.
 *
 * Secure mode (`ctx.renderAttr`): the value is run through the runtime's own
 * `jsxAttr` at build time and the serialized result is inlined, so the same
 * URL/CSS/name handling the runtime applies to dynamic values also applies to
 * static ones (`href="javascript:…"` → `href="#blocked"`, unsafe `style`
 * dropped, …) — while the output stays fully static.
 */
function emitStaticAttr(
  rawName: string,
  value: string | true,
  parts: string[],
  ctx: Ctx,
): void {
  if (ctx.renderAttr) {
    const rendered = ctx.renderAttr(rawName, value);
    const text = typeof rendered === "string" ? rendered : (rendered as any)?.value;
    if (typeof text === "string") {
      if (text) appendStatic(parts, ` ${text}`);
      return;
    }
    throw new Error(
      `[vite-plugin-precompile] secure mode: jsxAttr returned a Promise for static value "${rawName}" — this should never happen`,
    );
  }

  let name = remapAttrName(rawName);
  if (isEventHandlerName(name)) name = name.toLowerCase();

  if (value === true) {
    appendStatic(parts, ` ${name}`);
  } else {
    appendStatic(parts, ` ${name}="${escapeAttr(value)}"`);
  }
}

function emitChildren(
  children: JSXChild[],
  parts: string[],
  exprs: string[],
  ctx: Ctx,
): void {
  for (const child of children) {
    if (child.type === "JSXText") {
      /*
       * oxc/jSX parser guarantees the text is HTML-safe — any <letter
       * starts a JSXElement, < followed by space or > alone is a parse
       * error, and </tag closes the parent element, so < > & and
       * rawtext-close sequences (</script>, etc.) can never appear in
       * JSXText. Only template-literal escaping (backticks, ${, \)
       * in appendStatic/escapeForTemplate is needed.
       */
      appendStatic(parts, collapseJsxWhitespace(child.value));
    } else if (child.type === "JSXExpressionContainer") {
      if (child.expression.type !== "JSXEmptyExpression") {
        const inner = child.expression;
        const exprText = processExpressionForJsx(inner, ctx);

        addDynamic(parts, exprs, exprText);
      }
    } else if (child.type === "JSXElement") {
      if (isEligibleElement(child)) {
        const tag = (child.openingElement.name as JSXIdentifier).name;
        emitOpening(tag, child.openingElement.attributes, parts, exprs, ctx);
        if (!isVoidElement(tag)) {
          emitChildren(child.children, parts, exprs, ctx);
          appendStatic(parts, `</${tag}>`);
        }
      } else {
        const replaced = processExpressionForJsx(
          child as unknown as Expression,
          ctx,
        );
        addDynamic(parts, exprs, replaced);
      }
    } else if (child.type === "JSXFragment") {
      emitChildren(child.children, parts, exprs, ctx);
    } else if (child.type === "JSXSpreadChild") {
      const exprText = ctx.source.slice(
        child.expression.start,
        child.expression.end,
      );
      addDynamic(parts, exprs, exprText);
    }
  }
}

function processExpressionForJsx(expr: Expression, ctx: Ctx): string {
  const text = ctx.source.slice(expr.start, expr.end);
  return replaceNestedJsx(expr, text, ctx);
}

function replaceNestedJsx(node: Expression, text: string, ctx: Ctx): string {
  const nested: Replacement[] = [];
  findNestedJsx(node as unknown as AnyNode, nested, ctx);
  if (nested.length === 0) return text;

  let result = text;
  for (let i = nested.length - 1; i >= 0; i--) {
    const n = nested[i];
    if (!n) continue;
    const localStart = n.start - node.start;
    const localEnd = n.end - node.start;
    result = result.slice(0, localStart) + n.text + result.slice(localEnd);
  }
  return result;
}

function findNestedJsx(node: AnyNode, out: Replacement[], ctx: Ctx): void {
  if (node.type === "JSXElement") {
    const el = node as unknown as JSXElement;
    if (isEligibleElement(el)) {
      out.push({
        start: el.start,
        end: el.end,
        text: transformElement(el, ctx),
      });
      return;
    }
  } else if (node.type === "JSXFragment") {
    const frag = node as unknown as JSXFragment;
    out.push({
      start: frag.start,
      end: frag.end,
      text: transformFragment(frag, ctx),
    });
    return;
  }

  walkChildren(node, (child) => {
    findNestedJsx(child, out, ctx);
    return false;
  });
}

// Escape the characters that have special meaning inside the template-literal
// slices emitted by `buildTaggedTemplate` (`` ` ``, `\`, and `${`). Without
// this, a backtick or `${` coming from static JSX text or attribute values
// would either break codegen (SyntaxError) or, worse, inject an arbitrary
// interpolation into the generated template.
function escapeForTemplate(str: string): string {
  return str.replace(/[\\`]/g, "\\$&").replace(/\$\{/g, "\\${");
}

function appendStatic(parts: string[], str: string): void {
  parts[parts.length - 1] =
    (parts[parts.length - 1] ?? "") + escapeForTemplate(str);
}

function addDynamic(parts: string[], exprs: string[], expr: string): void {
  exprs.push(expr);
  parts.push("");
}

function buildTaggedTemplate(parts: string[], exprs: string[]): string {
  if (exprs.length === 0) {
    return `jsxTemplate\`${parts[0] ?? ""}\``;
  }

  let result = `jsxTemplate\`${parts[0] ?? ""}`;
  for (let i = 0; i < exprs.length; i++) {
    result += `\${${exprs[i] ?? ""}}${parts[i + 1] ?? ""}`;
  }
  result += "`";
  return result;
}

/**
 * Make sure the helpers used by the rewritten code are imported from
 * `rtSource`, editing through the MagicString so the sourcemap stays aligned.
 *
 * - Existing named (value) import from `rtSource`: missing helpers are merged
 *   into its braces, original specifier texts (aliases included) preserved.
 * - Otherwise a new import line is inserted before the first statement —
 *   after any leading comments, so pragma comments stay on top.
 */
function injectRuntimeImport(
  s: MagicString,
  program: Program,
  source: string,
  rtSource: string,
  helpers: string[],
): void {
  if (helpers.length === 0) return;

  for (const stmt of program.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    const decl = stmt as ImportDeclaration;
    if (decl.source.value !== rtSource) continue;
    if (decl.importKind === "type") continue;
    const named = (decl.specifiers ?? []).filter(
      (sp) => sp.type === "ImportSpecifier",
    );
    // Default-only / namespace / side-effect import: no braces to merge into.
    if (named.length === 0) continue;

    // Only an un-aliased specifier satisfies a helper: the generated code
    // references the canonical name, so `jsxTemplate as tpl` does not count.
    const existing = new Set(
      named
        .filter(
          (sp) =>
            sp.imported.type === "Identifier" &&
            sp.local.name === sp.imported.name,
        )
        .map((sp) => (sp.imported as { name: string }).name),
    );
    const missing = helpers.filter((h) => !existing.has(h));
    if (missing.length === 0) return;

    const declText = source.slice(decl.start, decl.end);
    const braceStart = decl.start + declText.indexOf("{");
    const braceEnd = decl.start + declText.indexOf("}");
    const specifierTexts = named.map((sp) => source.slice(sp.start, sp.end));
    s.overwrite(
      braceStart,
      braceEnd + 1,
      `{ ${[...specifierTexts, ...missing].join(", ")} }`,
    );
    return;
  }

  const importLine = `import { ${helpers.join(", ")} } from "${rtSource}";\n`;
  const firstStmt = program.body[0];
  if (firstStmt) {
    s.appendLeft(firstStmt.start, importLine);
  } else {
    s.prepend(importLine);
  }
}
