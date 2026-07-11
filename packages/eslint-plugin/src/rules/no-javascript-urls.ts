import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

// URL-bearing attributes whose value the browser may navigate to or execute.
// Mirrors @vincle/core's URL_ATTRIBUTES so the lint rule and the runtime block
// the same surface. Compared case-insensitively (covers `xlink:href`, etc.).
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "cite",
  "poster",
  "icon",
  "data",
  "background",
  "longdesc",
  "xlink:href",
]);

/**
 * Normalize a URL the way a browser does before matching the scheme: tab/CR/LF
 * are stripped from anywhere (they are ignored inside URLs), leading C0 control
 * characters and spaces are trimmed, then it is lowercased. This defeats the
 * classic bypasses `" javascript:…"` (leading space) and `"java\tscript:…"`.
 */
function normalizeScheme(url: string): string {
  return url
    .replace(/[\t\n\r]/g, "")
    .replace(/^[\x00-\x20]+/, "")
    .toLowerCase();
}

function isDangerousUrl(url: string): boolean {
  const s = normalizeScheme(url);
  return s.startsWith("javascript:") || s.startsWith("vbscript:");
}

/**
 * Extract a statically-known string from a JSX attribute value:
 * - `href="…"` (Literal)
 * - `href={"…"}` (expression-wrapped Literal)
 * - `href={`…`}` (template literal with no interpolation)
 * Returns null when the value is dynamic (can't be judged statically).
 */
function staticStringOf(
  value: TSESTree.JSXAttribute["value"],
): string | null {
  if (!value) return null;
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : null;
  }
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression;
    if (expr.type === "Literal") {
      return typeof expr.value === "string" ? expr.value : null;
    }
    if (expr.type === "TemplateLiteral" && expr.expressions.length === 0) {
      return expr.quasis[0]?.value.cooked ?? null;
    }
  }
  return null;
}

function attrName(node: TSESTree.JSXAttribute): string {
  if (node.name.type === "JSXNamespacedName") {
    return `${node.name.namespace.name}:${node.name.name.name}`;
  }
  return node.name.name;
}

export const noJavascriptUrls = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow javascript:/vbscript: URLs in URL-bearing attributes.",
    },

    schema: [],
    messages: {
      noJavascriptUrl:
        "javascript:/vbscript: URLs are not allowed for security reasons.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (!URL_ATTRIBUTES.has(attrName(node).toLowerCase())) return;
        const url = staticStringOf(node.value);
        if (url !== null && isDangerousUrl(url)) {
          context.report({ node, messageId: "noJavascriptUrl" });
        }
      },
    };
  },
});
