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

import {
  collapseJsxWhitespace,
  decodeJsxEntities,
  escapeAttr,
  escapeContent,
  escapeRawTagContent,
  hasSpreadOrInnerHTML,
  isLowercaseTag,
  isRawtextTag,
  isVoidElement,
  remapAttrName,
  RUNTIME_SOURCE,
} from "@vincle/precompile-core";
import MagicString from "magic-string";
import { parseSync, visitorKeys } from "oxc-parser";

export interface PluginConfig {
  runtimeSource?: string;
  /**
   * When `true` (default), static attributes are sanitized at build time by
   * running them through the runtime's own attribute serializer (`renderAttr`)
   * instead of being inlined verbatim. This mirrors what the runtime does for
   * dynamic values (URL-scheme blocking, unsafe-CSS dropping, name remapping).
   *
   * Set to `false` for Deno-precompile-compatible behavior: static attributes
   * are trusted and inlined verbatim (name-remapped and HTML-escaped, but no
   * URL/CSS sanitization). This is useful when migrating from Deno's
   * `jsx: "precompile"` transform or when the build-time dependency on the
   * runtime module is undesirable.
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

/**
 * Build-time content escaper — the runtime's `jsxEscape`. Injected by the Vite
 * plugin (loaded from `runtimeSource`) when `secure` is on, so the transformer
 * itself stays dependency-free and synchronous. For a static string value
 * `jsxEscape` always returns synchronously.
 *
 * The runtime wraps the result in a `RawString` to signal it's already-escaped
 * HTML; the transformer handles both the raw string (legacy) and `RawString`
 * (current) forms by inspecting the `.value` property.
 */
export type RenderEscape = (
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
  /** Present in secure mode (default); sanitizes static attributes at build time. */
  renderAttr: RenderAttr | null;
  /**
   * Present in secure mode (default); escapes static text content using the
   * target runtime's own escaping rules (byte-identity). When null (Deno mode
   * or runtime lacks jsxEscape), falls back to Vincle's escapeContent.
   */
  renderEscape: RenderEscape | null;
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
 * Walk the visitor keys of an AST node, invoking `visit` for each child with
 * the key it was reached through. Returns `true` if any visit call returned
 * `true` (early termination).
 */
function walkChildren(node: AnyNode, visit: (child: AnyNode, key: string) => boolean): boolean {
  for (const key of visitorKeys[node.type] ?? []) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && "type" in item) {
          if (visit(item as AnyNode, key)) return true;
        }
      }
    } else if (val && typeof val === "object" && "type" in val) {
      if (visit(val as AnyNode, key)) return true;
    }
  }
  return false;
}

/**
 * A transformed element/fragment is an ordinary expression. In expression
 * position (variable init, ternary branch, attribute container…) it can be
 * spliced verbatim, but as a direct JSX child of a PRESERVED element (a
 * component, or a host element skipped for spread/dangerouslySetInnerHTML) it
 * must be wrapped in a JSX expression container — otherwise the generated
 * `jsxTemplate\`…\`` lands as literal JSXText and the page renders its own
 * source code instead of the markup.
 */
function wrapForJsxChild(text: string, inJsxChildren: boolean): string {
  return inJsxChildren ? `{${text}}` : text;
}

export default function precompileTransform(
  code: string,
  id: string,
  config?: PluginConfig,
  renderAttr?: RenderAttr,
  renderEscape?: RenderEscape,
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
    const isCritical = result.errors.some((e: { severity: string }) => e.severity === "Error");
    if (isCritical) return null;
  }

  const program = result.program as Program;
  const ctx: Ctx = {
    source: code,
    used: new Set<string>(),
    renderAttr: config?.secure !== false ? (renderAttr ?? null) : null,
    renderEscape: config?.secure !== false ? (renderEscape ?? null) : null,
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
 *
 * Serves both call sites: top-level module statements, and the nested
 * expressions `replaceNestedJsx` splices back into a local slice of text. The
 * difference — the offsets — lives with the caller, not here.
 */
function collectNode(
  node: AnyNode,
  ctx: Ctx,
  replacements: Replacement[],
  inJsxChildren = false,
): void {
  if (node.type === "JSXElement") {
    const el = node as unknown as JSXElement;
    if (isEligibleElement(el)) {
      replacements.push({
        start: el.start,
        end: el.end,
        text: wrapForJsxChild(transformElement(el, ctx), inJsxChildren),
      });
      return;
    }
    // Preserved element (component / spread / dangerouslySetInnerHTML): its
    // direct `children` are JSX-child positions, everything else (attribute
    // expressions…) stays expression position.
    walkChildren(node, (child, key) => {
      collectNode(child, ctx, replacements, key === "children");
      return false;
    });
    return;
  }
  if (node.type === "JSXFragment") {
    const frag = node as unknown as JSXFragment;
    replacements.push({
      start: frag.start,
      end: frag.end,
      text: wrapForJsxChild(transformFragment(frag, ctx), inJsxChildren),
    });
    return;
  }

  walkChildren(node, (child) => {
    collectNode(child, ctx, replacements, false);
    return false;
  });
}

function isEligibleElement(node: JSXElement): boolean {
  const name = node.openingElement.name;
  if (name.type !== "JSXIdentifier") return false;
  const tag = name.name;
  if (!isLowercaseTag(tag)) return false;
  if (
    hasSpreadOrInnerHTML(
      node.openingElement.attributes.map((a) => {
        if (a.type === "JSXSpreadAttribute") return { kind: "spread" as const };
        return { kind: "attribute" as const, name: attrName(a) };
      }),
    )
  ) {
    return false;
  }
  // Two element shapes the transform declines rather than answer for. Both are
  // handed back as ordinary JSX — the same treatment a component gets — so the
  // runtime that the app compiles against decides, with its own rules.
  //
  // - **A rawtext element with a dynamic hole.** HTML escaping is not merely
  //   unnecessary inside `<script>`/`<style>`, it is wrong: a parser never
  //   decodes an entity there, so `a && b` escaped to `a &amp;&amp; b` reaches
  //   the JavaScript parser as those characters. Getting it right in the template
  //   would take a helper no other precompile runtime exports, and a generated
  //   call the target runtime does not have is a missing import — a build that
  //   fails on Preact or Hono. Static text stays inlined (see `emitChildren`):
  //   that is build-time escaping, not a runtime call.
  // - **A void element carrying content.** `<img>x</img>` has no valid HTML
  //   form, and the runtime refuses it. Declining here instead of emitting a
  //   template leaves one answer to that, and it is the runtime's.
  if (isRawtextTag(tag) && node.children.some((c) => c.type !== "JSXText")) return false;
  if (isVoidElement(tag) && node.children.some(hasRenderableContent)) return false;
  return true;
}

/**
 * Could this child put anything between a tag and its closing tag?
 *
 * Whitespace-only text and an empty expression (`{/* … *\/}`) cannot; a dynamic
 * expression might, and only the runtime can say. Both `<br>{null}</br>` and
 * `<br>x</br>` therefore reach `jsx()`, which accepts the first and refuses the
 * second — where guessing here would refuse a conditional child that renders to
 * nothing.
 */
function hasRenderableContent(child: JSXChild): boolean {
  if (child.type === "JSXText") return collapseJsxWhitespace(child.value) !== "";
  if (child.type === "JSXExpressionContainer")
    return child.expression.type !== "JSXEmptyExpression";
  return true;
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
  // A void element that got here has no content — `isEligibleElement` declines
  // the ones that do — so there is nothing to skip and no closing tag to write.
  if (!isVoidElement(tag)) {
    emitChildren(node.children, parts, exprs, ctx, rawtextTagOf(tag));
    appendStatic(parts, `</${tag}>`);
  }

  return buildTaggedTemplate(parts, exprs);
}

/**
 * The tag name if `tag` is a rawtext element, else undefined. The transform only
 * reaches this for lowercase tags (`isEligibleElement`), so the name is a valid
 * key for the runtime's rawtext escape map as-is.
 */
function rawtextTagOf(tag: string): string | undefined {
  return isRawtextTag(tag) ? tag : undefined;
}

function transformFragment(node: JSXFragment, ctx: Ctx): string {
  ctx.used.add("jsxTemplate");
  const parts: string[] = [""];
  const exprs: string[] = [];
  emitChildren(node.children, parts, exprs, ctx, undefined);
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

  const written = new Set<string>();
  for (const attr of attrs) {
    if (attr.type === "JSXAttribute") written.add(attrName(attr));
  }

  for (const attr of attrs) {
    if (attr.type === "JSXAttribute") {
      // `<div className="a" class="b">`: the runtime's batch serializer skips an
      // alias whose HTML name is also written out, so the native one wins. Here
      // each attribute is emitted on its own, so both landed in the tag and the
      // *parser* picked — the first one, which is the opposite answer. Attribute
      // names are always static (a spread makes the element ineligible), so the
      // same rule applies at build time, with no runtime cost.
      const name = attrName(attr);
      const html = remapAttrName(name);
      if (html !== name && written.has(html)) continue;
      emitAttribute(attr, parts, exprs, ctx);
    } else {
      throw new Error(
        "[vincle/vite-plugin-precompile] internal invariant broken: a spread attribute reached emitOpening — " +
          "isEligibleElement should have rejected this element. This is a bug in vincle, not in your " +
          "code or configuration — report it.",
      );
    }
  }

  appendStatic(parts, closingBracket);
}

function emitAttribute(attr: JSXAttribute, parts: string[], exprs: string[], ctx: Ctx): void {
  const rawName = attrName(attr);
  const init = attr.value;

  // key/ref: routed to the runtime even when static, matching Deno's precompile
  // (verified against 2.9.2) — the runtime's own policy (vincle drops both)
  // decides the output, so the transform never duplicates the drop-list.
  if ((rawName === "key" || rawName === "ref") && (init === null || init.type === "Literal")) {
    ctx.used.add("jsxAttr");
    const valueText = init === null ? "true" : JSON.stringify(init.value);
    appendStatic(parts, " ");
    addDynamic(parts, exprs, `jsxAttr(${JSON.stringify(rawName)}, ${valueText})`);
    return;
  }

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

  // Dynamic value: always handled by the runtime (name remapping, sanitizing,
  // drop-if-unsafe). The separating space lives in the static part, like
  // Deno's output — `jsxAttr` returns `name="value"` with no leading space, so
  // a dropped attribute leaves a harmless extra space rather than gluing tokens.
  if (init.type === "JSXExpressionContainer") {
    const expr = init.expression;
    if (expr.type !== "JSXEmptyExpression") {
      ctx.used.add("jsxAttr");
      const exprText = processExpressionForJsx(expr, ctx);
      appendStatic(parts, " ");
      addDynamic(parts, exprs, `jsxAttr(${JSON.stringify(rawName)}, ${exprText})`);
      return;
    }
    appendStatic(parts, ` ${remapAttrName(rawName)}=""`);
  }
}

/**
 * Emit a statically-known attribute (a boolean flag or a string literal).
 *
 * Secure mode (default, `ctx.renderAttr` present): the value is run through
 * the runtime's own `jsxAttr` at build time and the serialized result is
 * inlined, so the same URL/CSS/name handling the runtime applies to dynamic
 * values also applies to static ones (`href="javascript:…"` →
 * `href="#blocked"`, unsafe `style` dropped, …) — while the output stays fully
 * static.
 *
 * Deno mode (`secure: false`, `ctx.renderAttr` is null): static attributes are
 * trusted and inlined. The name is remapped to its HTML form (`className` →
 * `class`, `tabIndex` → `tabindex`) — `resolveAttrName` falls back to
 * lowercasing, which covers event-handler names (`onClick` → `onclick`) — and
 * the value is HTML-escaped. No value sanitization is applied — only the
 * runtime handles that for *dynamic* values, which always go through `jsxAttr`.
 * This matches Deno's own precompile output.
 */
function emitStaticAttr(rawName: string, value: string | true, parts: string[], ctx: Ctx): void {
  if (ctx.renderAttr) {
    const rendered = ctx.renderAttr(rawName, value);
    const text = typeof rendered === "string" ? rendered : (rendered as any)?.value;
    if (typeof text === "string") {
      if (text) appendStatic(parts, ` ${text}`);
      return;
    }
    throw new Error(
      `[vincle/vite-plugin-precompile] secure mode: jsxAttr returned a Promise for static value "${rawName}" — ` +
        "this should never happen. This is a bug in vincle, not in your code or configuration — report it.",
    );
  }

  const name = remapAttrName(rawName);

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
  rawtextTag: string | undefined,
): void {
  for (const child of children) {
    if (child.type === "JSXText") {
      // Mirrors what the dynamic path does at runtime, so precompiled output
      // is byte-identical. `appendStatic`/`escapeForTemplate` handles the
      // template-literal metacharacters (backtick, `${`, `\`) for all branches.
      const collapsed = collapseJsxWhitespace(child.value);
      if (rawtextTag && ctx.renderAttr === null) {
        // Deno mode: entities stay verbatim, matching Deno's own precompile —
        // an HTML parser never decodes entities inside rawtext anyway.
        appendStatic(parts, collapsed);
      } else if (rawtextTag) {
        // Secure mode: decode then re-escape with escapeRawTagContent, which
        // also guards the closing tag — jsxEscape doesn't handle rawtext.
        const decoded = decodeJsxEntities(collapsed);
        appendStatic(parts, escapeRawTagContent(decoded, rawtextTag));
      } else {
        // Non-rawtext: decode, then the runtime's own jsxEscape when available
        // (byte-identical to it), else Vincle's escapeContent as fallback.
        const decoded = decodeJsxEntities(collapsed);
        const escaped = ctx.renderEscape
          ? extractRawString(ctx.renderEscape(decoded))
          : escapeContent(decoded);
        appendStatic(parts, escaped);
      }
    } else if (child.type === "JSXExpressionContainer") {
      if (child.expression.type !== "JSXEmptyExpression") {
        const inner = child.expression;
        const exprText = processExpressionForJsx(inner, ctx);

        addDynamic(parts, exprs, escapeCall(exprText, ctx));
      }
    } else if (child.type === "JSXElement") {
      if (isEligibleElement(child)) {
        const tag = (child.openingElement.name as JSXIdentifier).name;
        emitOpening(tag, child.openingElement.attributes, parts, exprs, ctx);
        if (!isVoidElement(tag)) {
          emitChildren(child.children, parts, exprs, ctx, rawtextTagOf(tag));
          appendStatic(parts, `</${tag}>`);
        }
      } else {
        // Component / spread / dangerouslySetInnerHTML element: left as JSX for
        // the compiler, and passed to `jsxTemplate` WITHOUT `jsxEscape` — the
        // Deno/Preact precompile contract. `jsx()` returns a VNode, which is not
        // a value to escape: it is markup to render, and `jsxTemplate` renders
        // it through the tree walk. Wrapping it here would double-handle it
        // (jsxEscape lets VNodes through, but the call is pure overhead).
        const replaced = processExpressionForJsx(child as unknown as Expression, ctx);
        addDynamic(parts, exprs, replaced);
      }
    } else if (child.type === "JSXFragment") {
      emitChildren(child.children, parts, exprs, ctx, rawtextTag);
    } else if (child.type === "JSXSpreadChild") {
      const exprText = ctx.source.slice(child.expression.start, child.expression.end);
      addDynamic(parts, exprs, escapeCall(exprText, ctx));
    }
  }
}

/**
 * The runtime call for a dynamic hole.
 *
 * `jsxEscape` is the only escaper the precompile contract has, and it escapes
 * for HTML — which inside `<script>`/`<style>` produces entities the parser will
 * never decode. There is no rawtext hole to serve here, though:
 * `isEligibleElement` declines a rawtext element that has one, so the element
 * reaches this file's output as JSX and its content is the runtime's business.
 */
function escapeCall(exprText: string, ctx: Ctx): string {
  ctx.used.add("jsxEscape");
  return `jsxEscape(${exprText})`;
}

function processExpressionForJsx(expr: Expression, ctx: Ctx): string {
  const text = ctx.source.slice(expr.start, expr.end);
  return replaceNestedJsx(expr, text, ctx);
}

function replaceNestedJsx(node: Expression, text: string, ctx: Ctx): string {
  const nested: Replacement[] = [];
  collectNode(node as unknown as AnyNode, ctx, nested);
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

// Escape the characters that have special meaning inside the template-literal
// slices emitted by `buildTaggedTemplate` (`` ` ``, `\`, and `${`). Without
// this, a backtick or `${` coming from static JSX text or attribute values
// would either break codegen (SyntaxError) or, worse, inject an arbitrary
// interpolation into the generated template.
/**
 * Unwrap a value that may be a plain string, a `RawString`-shaped object
 * (`{ value: string }`), or a Promise of either. For static string values
 * the runtime's jsxEscape always returns synchronously; the Promise branch
 * is a type-safety escape hatch that will never trigger at build time.
 */
function extractRawString(
  result: string | { value: string } | Promise<string | { value: string }>,
): string {
  if (result instanceof Promise) {
    throw new Error("jsxEscape returned a Promise for static text — unexpected");
  }
  return typeof result === "string" ? result : result.value;
}

function escapeForTemplate(str: string): string {
  return str.replace(/[\\`]/g, "\\$&").replace(/\$\{/g, "\\${");
}

function appendStatic(parts: string[], str: string): void {
  parts[parts.length - 1] = (parts[parts.length - 1] ?? "") + escapeForTemplate(str);
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
    const named = (decl.specifiers ?? []).filter((sp) => sp.type === "ImportSpecifier");
    // Default-only / namespace / side-effect import: no braces to merge into.
    if (named.length === 0) continue;

    // Only an un-aliased specifier satisfies a helper: the generated code
    // references the canonical name, so `jsxTemplate as tpl` does not count.
    const existing = new Set(
      named
        .filter((sp) => sp.imported.type === "Identifier" && sp.local.name === sp.imported.name)
        .map((sp) => (sp.imported as { name: string }).name),
    );
    const missing = helpers.filter((h) => !existing.has(h));
    if (missing.length === 0) return;

    const declText = source.slice(decl.start, decl.end);
    const braceStart = decl.start + declText.indexOf("{");
    const braceEnd = decl.start + declText.indexOf("}");
    const specifierTexts = named.map((sp) => source.slice(sp.start, sp.end));
    s.overwrite(braceStart, braceEnd + 1, `{ ${[...specifierTexts, ...missing].join(", ")} }`);
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
