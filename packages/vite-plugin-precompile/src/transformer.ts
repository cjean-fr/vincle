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
}

/**
 * Build-time attribute serializer — the runtime's `jsxAttr`. Injected by the
 * Vite plugin (loaded from `runtimeSource`) unless `compatibility` is on, so the
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
 * plugin (loaded from `runtimeSource`) unless `compatibility` is on, so the transformer
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
  /** Present unless `compatibility` is on; sanitizes static attributes at build time. */
  renderAttr: RenderAttr | null;
  /**
   * Present unless `compatibility` is on; escapes static text content using the
   * target runtime's own escaping rules (byte-identity). When null —
   * compatibility mode, or a direct caller that passed `renderAttr` alone —
   * falls back to Vincle's escapeContent. The plugin never gets there: it
   * refuses a runtime that exports one helper and not the other.
   */
  renderEscape: RenderEscape | null;
  /**
   * Reproduce Deno's precompile output, defects included — true whenever no
   * serializer was injected.
   *
   * There is no option behind this. A serializer arrives only for a runtime
   * that declares the `"vincle"` precompile dialect, which is the runtime that
   * promises a precompiled page renders the same bytes as a dynamic one. That
   * promise is what makes it safe to correct the reference transform; without
   * it, correcting anything would mean guessing how the target runtime
   * serializes, so the reference output is what gets emitted.
   */
  compatibility: boolean;
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
    renderAttr: renderAttr ?? null,
    renderEscape: renderEscape ?? null,
    compatibility: renderAttr === undefined,
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
    if (isEligibleElement(el, ctx)) {
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

function isEligibleElement(node: JSXElement, ctx: Ctx): boolean {
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
  // …unless compatibility mode was asked for, where reproducing Deno's output
  // is the whole point: it precompiles such an element and escapes the hole, so
  // the CSS or JS comes out with entities in it. Preact escapes it on its
  // dynamic path too, so nothing diverges *there*; here it does, and that is
  // what opting in buys.
  if (!ctx.compatibility && isRawtextTag(tag) && node.children.some((c) => c.type !== "JSXText")) {
    return false;
  }
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
    emitChildren(node.children, parts, exprs, ctx, rawtextTagOf(tag), ctx.compatibility);
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
  // drop-if-unsafe). The separating space goes in the static text, which is the
  // contract every precompile transform is written against — `jsxAttr` returns
  // `name="value"` bare. A runtime that drops the attribute is left with that
  // space; `@vincle/core` takes it back in `jsxTemplate`, where the tag is
  // being assembled and the space can be recognised as a separator.
  if (init.type === "JSXExpressionContainer") {
    const expr = init.expression;
    if (expr.type !== "JSXEmptyExpression") {
      const exprText = processExpressionForJsx(expr, ctx);
      const htmlName = attrNameFor(rawName, ctx);
      appendStatic(parts, " ");
      if (ctx.compatibility && COMPAT_INLINED_BOOLEAN_ATTRS.has(htmlName)) {
        addDynamic(parts, exprs, `(${exprText}) ? ${JSON.stringify(htmlName)} : ""`);
        return;
      }
      ctx.used.add("jsxAttr");
      addDynamic(parts, exprs, `jsxAttr(${JSON.stringify(htmlName)}, ${exprText})`);
      return;
    }
    appendStatic(parts, ` ${attrNameFor(rawName, ctx)}=""`);
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
 * Compatibility mode (`ctx.renderAttr` is null): static attributes are
 * trusted and inlined. The name is remapped to its HTML form (`className` →
 * `class`, `tabIndex` → `tabindex`) — `resolveAttrName` falls back to
 * lowercasing, which covers event-handler names (`onClick` → `onclick`) — and
 * the value is HTML-escaped. No value sanitization is applied — only the
 * runtime handles that for *dynamic* values, which always go through `jsxAttr`.
 * This matches Deno's own precompile output.
 */
function emitStaticAttr(rawName: string, value: string | true, parts: string[], ctx: Ctx): void {
  if (ctx.renderAttr) {
    // The HTML name, not the authored one: remapping belongs to the transform,
    // which is where Deno does it, and a runtime's `jsxAttr` need not. Preact's
    // does not — it remaps when rendering a VNode, so a precompiled
    // `className="box"` reached the page as `className="box"` and styled
    // nothing. Idempotent for a runtime that remaps too, `@vincle/core`
    // included.
    const rendered = ctx.renderAttr(attrNameFor(rawName, ctx), value);
    const text = typeof rendered === "string" ? rendered : (rendered as any)?.value;
    if (typeof text === "string") {
      if (text) appendStatic(parts, ` ${text}`);
      return;
    }
    throw new Error(
      `[vincle/vite-plugin-precompile] jsxAttr returned a Promise for static value "${rawName}" — ` +
        "this should never happen. This is a bug in vincle, not in your code or configuration — report it.",
    );
  }

  const name = attrNameFor(rawName, ctx);

  if (value === true) {
    appendStatic(parts, ` ${name}`);
  } else {
    appendStatic(parts, ` ${name}="${escapeAttr(value)}"`);
  }
}

const RE_TRAILING_SPACE = /\s+$/;

/**
 * The two names Deno's table resolves differently, compatibility only —
 * measured against 2.9.2 and 2.9.6.
 *
 * `xlinkHref` → `href` is it modernising: SVG2 replaced `xlink:href`, and both
 * work in a browser. `xmlnsXlink` → `xmlnsxlink` is its default lowercasing
 * with no table entry, and that one is not an attribute at all — the namespace
 * declaration it was meant to be is `xmlns:xlink`. Reproducing both is what
 * opting into its output means.
 */
const COMPAT_NAME_OVERRIDES = new Map([
  ["xlink:href", "href"],
  ["xmlns:xlink", "xmlnsxlink"],
]);

/** The HTML name this attribute gets, per the mode's table. */
function attrNameFor(rawName: string, ctx: Ctx): string {
  const name = remapAttrName(rawName);
  return ctx.compatibility ? (COMPAT_NAME_OVERRIDES.get(name) ?? name) : name;
}

/**
 * The attributes Deno's precompile inlines as `expr ? "name" : ""` instead of
 * calling `jsxAttr` — measured against 2.9.2 and 2.9.6, in HTML-name form.
 *
 * Its own defects come with it, which is why this is compatibility-only: the
 * value of a non-boolean value is dropped (`readOnly={"x"}` renders `readonly`,
 * not `readonly="x"`), and `""` counts as absent where Preact's dynamic path
 * emits the attribute. `hidden`, `draggable`, `contentEditable` and
 * `spellCheck` are *not* in it — Deno routes those through `jsxAttr`, since
 * they take a value.
 */
const COMPAT_INLINED_BOOLEAN_ATTRS = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "inert",
  "ismap",
  "loop",
  "multiple",
  "muted",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

/**
 * `trimTrailingText`: right-trim the text that ends this element, the way
 * Deno's precompile does — `<span>a </span>` becomes `<span>a</span>`.
 *
 * Only in compatibility mode, and it is not a formatting detail: the space is
 * one an HTML parser renders, so `<span>a </span><span>b</span>` reads "ab"
 * there. Deno's own `jsx: "react-jsx"` keeps it, and so does the default mode
 * here, which follows the JSX rule the runtime path also applies.
 *
 * Only a text node in last position triggers it. A trailing element, an
 * expression or a fragment does not — measured against Deno 2.9.2 and 2.9.6.
 */
function emitChildren(
  children: JSXChild[],
  parts: string[],
  exprs: string[],
  ctx: Ctx,
  rawtextTag: string | undefined,
  trimTrailingText = false,
): void {
  const last = children[children.length - 1];
  for (const child of children) {
    if (child.type === "JSXText") {
      // Mirrors what the dynamic path does at runtime, so precompiled output
      // is byte-identical. `appendStatic`/`escapeForTemplate` handles the
      // template-literal metacharacters (backtick, `${`, `\`) for all branches.
      const collapsed =
        trimTrailingText && child === last
          ? collapseJsxWhitespace(child.value).replace(RE_TRAILING_SPACE, "")
          : collapseJsxWhitespace(child.value);
      if (rawtextTag && ctx.compatibility) {
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
      if (isEligibleElement(child, ctx)) {
        const tag = (child.openingElement.name as JSXIdentifier).name;
        emitOpening(tag, child.openingElement.attributes, parts, exprs, ctx);
        if (!isVoidElement(tag)) {
          emitChildren(child.children, parts, exprs, ctx, rawtextTagOf(tag), ctx.compatibility);
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
