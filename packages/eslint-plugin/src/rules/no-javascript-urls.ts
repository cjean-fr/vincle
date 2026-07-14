import type { RuleModule } from "../types.js";

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

function staticStringOf(value: any): string | null {
  if (!value) return null;
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : null;
  }
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression;
    if (expr.type === "Literal") {
      return typeof expr.value === "string" ? expr.value : null;
    }
    if (expr.type === "TemplateLiteral" && expr.expressions?.length === 0) {
      return expr.quasis?.[0]?.value?.cooked ?? null;
    }
  }
  return null;
}

function attrName(node: any): string {
  if (node.name?.type === "JSXNamespacedName") {
    return `${node.name.namespace.name}:${node.name.name.name}`;
  }
  return node.name?.name ?? "";
}

export const noJavascriptUrls: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow javascript:/vbscript: URLs in URL-bearing attributes.",
    },
    schema: [],
    messages: {
      noJavascriptUrl: "javascript:/vbscript: URLs are not allowed for security reasons.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (!URL_ATTRIBUTES.has(attrName(node).toLowerCase())) return;
        const url = staticStringOf(node.value);
        if (url !== null && isDangerousUrl(url)) {
          context.report({ node, messageId: "noJavascriptUrl" });
        }
      },
    };
  },
};
