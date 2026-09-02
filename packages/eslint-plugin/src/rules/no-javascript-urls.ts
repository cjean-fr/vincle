import { attrMeta, schemeOf } from "@vincle/core/html";

import type { RuleModule } from "../types.js";

/**
 * Lint policy, not security policy: this rule helps a developer catch a
 * `javascript:`/`vbscript:` URL they wrote by accident. `data:text/html` is
 * deliberately left alone — a developer writing one means it — and `buildAttrs`
 * blocks it at render time, where the full security policy lives (`isSafeScheme`).
 *
 * The parsing is delegated to `core/html`'s `schemeOf` so the two layers agree
 * on what a scheme *is* (tabs, C0 controls, relative references): a rule that
 * missed `java\tscript:` while the runtime blocked it would just confuse.
 */
function isDangerousUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme === "javascript" || scheme === "vbscript";
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
        // Delegates to `attrMeta`, the runtime's own name resolution, so the
        // lint's answer matches it. A raw `.toLowerCase()` does not:
        // `xlinkHref="javascript:…"` is where the two part ways.
        if (!attrMeta(attrName(node)).isUrl) return;
        const url = staticStringOf(node.value);
        if (url !== null && isDangerousUrl(url)) {
          context.report({ node, messageId: "noJavascriptUrl" });
        }
      },
    };
  },
};
