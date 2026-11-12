import type { RuleModule } from "../types.js";

/**
 * Lint policy, not security policy: this rule tells a developer that a
 * `<script>` or `<style>` written inside `<svg>` or `<math>` is not raw text.
 * In foreign content the HTML parser reads a `<` as the start of a tag and
 * `&` as a character reference, so the source must be shipped pre-escaped as
 * text (rule 2 applies: trusted bytes, caller-owned).
 *
 * The documented recipe - `raw(escapeContent(source))`, with `raw` from
 * `@vincle/core` and `escapeContent` from `@vincle/core/html` - is recognized
 * by resolving the callee through the file's scope chain (aliases and
 * namespace imports included) and is not flagged. A name shadowed by a local
 * binding - parameter, variable, catch binding - resolves to that binding,
 * not to the helper, so the call keeps the warning. Recognition follows
 * direct imports only: a barrel re-export is the recipe semantically but is
 * not followed, so it warns - the safe direction.
 *
 * The check is lexical: it follows JSX nesting, where `foreignObject`, `desc`
 * and `title` (SVG), the MathML text integration points and `annotation-xml`
 * with `encoding="text/html"` (or `application/xhtml+xml`) switch back to
 * HTML. A script built inside a component used under `<svg>` is not visible
 * here, and neither is content opened through `raw()` or a template; the
 * render-time contract is the one that counts.
 */

// Elements that switch an SVG or MathML subtree back to HTML content.
// `annotation-xml` is handled separately: it is an integration point only
// with an explicit HTML encoding.
const HTML_POINTS = new Set(["foreignObject", "desc", "title", "mi", "mo", "mn", "ms", "mtext"]);
const ANNOTATION_HTML_ENCODINGS = new Set(["text/html", "application/xhtml+xml"]);

// Minimal JSX/ESTree shapes this rule reads, instead of `any`.
interface JSXIdentifierNode {
  type: "JSXIdentifier";
  name: string;
}
interface JSXAttributeNode {
  type: "JSXAttribute";
  name: JSXIdentifierNode;
  value: { type: string; value?: unknown } | null;
}
interface JSXOpeningElementNode {
  name: { type: string; name?: string };
  attributes: Array<JSXAttributeNode | { type: string }>;
}
interface ExpressionNode {
  type: string;
  name?: string;
  value?: unknown;
  callee?: ExpressionNode;
  object?: ExpressionNode;
  property?: ExpressionNode;
  computed?: boolean;
  arguments?: ExpressionNode[];
  expression?: ExpressionNode;
}
interface JSXChildNode {
  type: string;
  value?: string;
  expression?: ExpressionNode;
}
interface JSXElementNode {
  type: "JSXElement";
  openingElement: JSXOpeningElementNode;
  children: JSXChildNode[];
}

// Minimal scope-manager shapes (ESLint-compatible, provided at runtime by
// both ESLint's SourceCode.getScope and oxlint's JS plugin API) that this
// rule reads, instead of `any`.
interface ImportSpecifierDefNode {
  type: string;
  imported?: { type: string; name?: string; value?: unknown };
}
interface DefinitionNode {
  type: string;
  node?: ImportSpecifierDefNode;
  parent?: { type: string; source?: { value?: unknown } } | null;
}
interface ScopeVariable {
  defs?: DefinitionNode[];
}
interface ScopeLike {
  set?: Map<string, ScopeVariable>;
  upper?: ScopeLike | null;
}

function resolveVariable(scope: ScopeLike, name: string): ScopeVariable | null {
  let current: ScopeLike | null | undefined = scope;
  while (current) {
    const variable = current.set?.get(name);
    if (variable) return variable;
    current = current.upper;
  }
  return null;
}

/**
 * `name` must resolve to the helper itself: a direct import of `imported`
 * from `source`. Anything else - a parameter, a local variable, a catch
 * binding, an import from another module (barrel re-export included) - is
 * not the recipe.
 */
function isHelperBinding(
  scope: ScopeLike,
  name: string,
  source: string,
  imported: string,
  namespace: boolean,
): boolean {
  const variable = resolveVariable(scope, name);
  if (!variable) return false;
  const defs = variable.defs ?? [];
  if (defs.length !== 1) return false;
  const def = defs[0];
  if (!def || def.type !== "ImportBinding") return false;
  if (def.parent?.source?.value !== source) return false;
  if (namespace) return def.node?.type === "ImportNamespaceSpecifier";
  if (def.node?.type !== "ImportSpecifier") return false;
  const importedNode = def.node.imported;
  const importedName =
    importedNode &&
    (typeof importedNode.name === "string" ? importedNode.name : importedNode.value);
  return importedName === imported;
}

function isCallTo(
  expr: ExpressionNode,
  scope: ScopeLike,
  source: string,
  imported: string,
): boolean {
  const callee = expr.callee;
  if (callee === undefined) return false;
  if (callee.type === "Identifier")
    return (
      typeof callee.name === "string" &&
      isHelperBinding(scope, callee.name, source, imported, false)
    );
  if (callee.type === "MemberExpression" && callee.computed !== true) {
    const obj = callee.object;
    const prop = callee.property;
    return (
      obj !== undefined &&
      obj.type === "Identifier" &&
      typeof obj.name === "string" &&
      isHelperBinding(scope, obj.name, source, imported, true) &&
      prop !== undefined &&
      prop.type === "Identifier" &&
      prop.name === imported
    );
  }
  return false;
}

/** The recipe: `raw(escapeContent(source))`, one trusted call around one escape. */
function isRecipeCall(expr: ExpressionNode, scope: ScopeLike): boolean {
  if (expr.type !== "CallExpression") return false;
  if (!isCallTo(expr, scope, "@vincle/core", "raw")) return false;
  const args = expr.arguments ?? [];
  if (args.length !== 1) return false;
  const inner = args[0];
  if (!inner) return false;
  return (
    inner.type === "CallExpression" &&
    (inner.arguments ?? []).length === 1 &&
    isCallTo(inner, scope, "@vincle/core/html", "escapeContent")
  );
}

/** Every child is whitespace or the recipe, with at least one recipe call. */
function isRecipeElement(node: JSXElementNode, getScope: (node: unknown) => ScopeLike): boolean {
  let saw = false;
  for (const child of node.children) {
    if (child.type === "JSXText" && (child.value ?? "").trim() === "") continue;
    if (child.type !== "JSXExpressionContainer" || child.expression === undefined) return false;
    // Resolve at the expression's own site, not at the element: JSX creates
    // no scope, so the two agree today, but the evaluation site is the
    // correct place to ask.
    if (isRecipeCall(child.expression, getScope(child.expression))) {
      saw = true;
      continue;
    }
    return false;
  }
  return saw;
}

export const noForeignRawtext: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn that <script>/<style> text inside <svg>/<math> is parsed as markup, not raw text.",
    },
    schema: [],
    messages: {
      foreignRawtext:
        "The text of this <{{tag}}> is inside <{{root}}>: the parser reads it as markup, not raw text, so a `<` opens a tag. Ship the source pre-escaped as text - raw(escapeContent(source)) - instead of relying on the HTML rawtext rule.",
    },
  },
  create(context) {
    // Context of each open JSXElement, innermost last: "html", or the tag of
    // the foreign root the element sits under ("svg" / "math"). The document
    // starts as HTML; a JSXFragment is transparent.
    const stack: string[] = [];
    return {
      JSXElement(rawNode) {
        const node = rawNode as JSXElementNode;
        const name = intrinsicName(node);
        const parent = stack[stack.length - 1] ?? "html";
        if (
          (name === "script" || name === "style") &&
          parent !== "html" &&
          !isRecipeElement(node, (n) => context.sourceCode.getScope(n) as ScopeLike)
        ) {
          context.report({
            node: node.openingElement.name,
            messageId: "foreignRawtext",
            data: { tag: name, root: parent },
          });
        }
        let ctx = parent;
        if (name === "svg" || name === "math") ctx = name;
        else if (name !== null && HTML_POINTS.has(name)) ctx = "html";
        else if (name === "annotation-xml") {
          const encoding = stringAttr(node, "encoding");
          if (encoding !== null && ANNOTATION_HTML_ENCODINGS.has(encoding)) ctx = "html";
        }
        stack.push(ctx);
      },
      "JSXElement:exit"() {
        stack.pop();
      },
    };
  },
};

function intrinsicName(node: JSXElementNode): string | null {
  const name = node.openingElement.name;
  return name.type === "JSXIdentifier" && typeof name.name === "string" ? name.name : null;
}

function stringAttr(node: JSXElementNode, attr: string): string | null {
  for (const a of node.openingElement.attributes) {
    if (a.type !== "JSXAttribute") continue;
    const attrNode = a as JSXAttributeNode;
    if (attrNode.name.name !== attr) continue;
    if (attrNode.value && typeof attrNode.value.value === "string") return attrNode.value.value;
    return null;
  }
  return null;
}
