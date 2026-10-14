import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import twig from "highlight.js/lib/languages/twig";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { defineHastPlugin, htmlToHast } from "satteri";

import type { Locale } from "./i18n/locale.js";

import { translatorFor } from "./i18n/interface.js";

for (const [name, grammar] of Object.entries({
  xml,
  javascript,
  typescript,
  bash,
  json,
  php,
  yaml,
  twig,
}))
  hljs.registerLanguage(name, grammar);
const aliases: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  html: "xml",
  sh: "bash",
  shell: "bash",
};

/** Highlight at build time so the first paint already contains token colors. */
export function codeBlocks(locale: Locale) {
  const t = translatorFor(locale);
  return defineHastPlugin({
    name: "docs-code-blocks",
    element: {
      filter: ["pre"],
      visit(node) {
        const code = node.children[0];
        if (code?.type !== "element" || code.tagName !== "code") return;
        const classes = code.properties.className;
        const languageClasses = Array.isArray(classes) ? classes : [classes];
        const terminal = languageClasses.some(
          (name) =>
            typeof name === "string" &&
            /^language-(?:bash|sh|shell|console|shellsession)$/.test(name),
        );
        const requested = languageClasses.find(
          (name) => typeof name === "string" && name.startsWith("language-"),
        );
        const language = typeof requested === "string" ? requested.slice(9) : undefined;
        const canonical = language && (aliases[language] ?? language);
        let renderedPre = node;
        if (canonical && hljs.getLanguage(canonical)) {
          const source = code.children
            .map((child) => (child.type === "text" ? child.value : ""))
            .join("");
          const highlighted = htmlToHast(
            hljs.highlight(source, { language: canonical, ignoreIllegals: true }).value,
            { fragment: true },
          );
          if (highlighted.type === "root")
            renderedPre = {
              ...node,
              children: [
                {
                  ...code,
                  children: highlighted.children.filter(
                    (child) => child.type === "element" || child.type === "text",
                  ),
                },
              ],
            };
        }
        const blockClasses = ["docs-code-block"];
        const data: unknown = code.data;
        const meta =
          data && typeof data === "object" && "meta" in data && typeof data.meta === "string"
            ? data.meta
            : "";
        const title = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
        const label = title?.[1] ?? title?.[2] ?? title?.[3];
        if (label) blockClasses.push("has-title");
        if (terminal) blockClasses.push("docs-terminal");
        return {
          type: "element",
          tagName: "figure",
          properties: { className: blockClasses },
          children: [
            ...(terminal
              ? [
                  {
                    type: "element" as const,
                    tagName: "div",
                    properties: { className: ["docs-terminal-bar"] },
                    children: [
                      {
                        type: "element" as const,
                        tagName: "span",
                        properties: { className: ["docs-terminal-dots"], "aria-hidden": "true" },
                        children: [],
                      },
                      ...(label
                        ? [
                            {
                              type: "element" as const,
                              tagName: "span",
                              properties: { className: ["docs-terminal-label"] },
                              children: [{ type: "text" as const, value: label }],
                            },
                          ]
                        : []),
                    ],
                  },
                ]
              : []),
            ...(label && !terminal
              ? [
                  {
                    type: "element" as const,
                    tagName: "figcaption",
                    properties: { className: ["docs-code-caption"] },
                    children: [
                      {
                        type: "element" as const,
                        tagName: "span",
                        properties: { className: ["docs-code-title"] },
                        children: [{ type: "text" as const, value: label }],
                      },
                    ],
                  },
                ]
              : []),
            {
              type: "element",
              tagName: "button",
              properties: {
                type: "button",
                hidden: true,
                "data-docs-copy": "",
                "data-docs-copied": t("copiedCode"),
                "aria-label": t("copyCode"),
                title: t("copyCode"),
              },
              children: [
                {
                  type: "element",
                  tagName: "svg",
                  properties: {
                    className: ["docs-copy-icon"],
                    viewBox: "0 0 24 24",
                    width: 16,
                    height: 16,
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "1.5",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    "aria-hidden": "true",
                  },
                  children: [
                    {
                      type: "element",
                      tagName: "rect",
                      properties: { x: "9", y: "9", width: 12, height: 12, rx: "2" },
                      children: [],
                    },
                    {
                      type: "element",
                      tagName: "path",
                      properties: { d: "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" },
                      children: [],
                    },
                  ],
                },
                {
                  type: "element",
                  tagName: "svg",
                  properties: {
                    className: ["docs-copy-check"],
                    viewBox: "0 0 24 24",
                    width: 16,
                    height: 16,
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    "aria-hidden": "true",
                  },
                  children: [
                    {
                      type: "element",
                      tagName: "path",
                      properties: { d: "m5 12 4 4L19 6" },
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              type: "element",
              tagName: "span",
              properties: {
                className: ["docs-copy-tooltip"],
                role: "status",
                "aria-live": "polite",
              },
              children: [],
            },
            renderedPre,
          ],
        };
      },
    },
  });
}
