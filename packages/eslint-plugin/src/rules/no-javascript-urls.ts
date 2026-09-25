import { ANIMATED_URL_ATTRIBUTES, attrMeta, isAnimationTag, schemeOf } from "@vincle/core/html";

import type { RuleModule } from "../types.js";

/**
 * Lint policy, not security policy: this rule helps a developer catch a
 * `javascript:`/`vbscript:` URL they wrote by accident. Every other scheme is
 * left alone: `buildAttrs` judges it at render time against an allowlist, where
 * the full security policy lives (`isSafeScheme`), so a URL this rule does not
 * report can still render as `#blocked`.
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

/**
 * The intrinsic tag this attribute sits on, or `undefined` when it cannot be
 * read or names a component (`<Animate>` is a function, not an element).
 *
 * Needed because one URL-bearing position is not a name: on an animation
 * element, `values`/`to`/`from`/`by` carry the URL of the attribute named by a
 * sibling. `attrMeta` stays a name-only answer for exactly that reason, so each
 * layer composes the two sets for its own reach — here the element, at render
 * time the whole bag.
 */
function elementTag(node: any): string | undefined {
  const name = node.parent?.name;
  if (name?.type !== "JSXIdentifier") return undefined;
  const tag: string = name.name;
  return tag[0] === tag[0]?.toLowerCase() ? tag : undefined;
}

/**
 * How this attribute's value is judged on the element it sits on: not at all,
 * as one URL, or as the `;` list an animation applies item by item.
 */
function urlCheck(node: any, name: string): "none" | "one" | "list" {
  const meta = attrMeta(name);
  if (meta.isUrl) return "one";
  const tag = elementTag(node);
  return tag !== undefined && isAnimationTag(tag) && ANIMATED_URL_ATTRIBUTES.has(meta.name)
    ? "list"
    : "none";
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
        // Delegates to `attrMeta` and the two animation sets, so the lint's
        // answer matches the runtime's. A raw `.toLowerCase()` does not:
        // `xlinkHref="javascript:…"` is where the two part ways.
        //
        // What this cannot see is the `attributeName` sibling, so a computed
        // target is not judged here: the rule is a hint about a literal, and
        // `buildAttrs` is the authority that refuses one aimed at a handler.
        const check = urlCheck(node, attrName(node));
        if (check === "none") return;
        const url = staticStringOf(node.value);
        if (url === null) return;
        const urls = check === "list" ? url.split(";").map((u) => u.trim()) : [url];
        if (urls.some(isDangerousUrl)) {
          context.report({ node, messageId: "noJavascriptUrl" });
        }
      },
    };
  },
};
