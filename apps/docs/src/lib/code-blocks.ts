import { createHighlighterCore, createCssVariablesTheme } from "@shikijs/core";
import { createOnigurumaEngine } from "@shikijs/engine-oniguruma";
import getWasm from "@shikijs/engine-oniguruma/wasm-inlined";
import bash from "@shikijs/langs/bash";
import handlebars from "@shikijs/langs/handlebars";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import php from "@shikijs/langs/php";
import pug from "@shikijs/langs/pug";
import tsx from "@shikijs/langs/tsx";
import twig from "@shikijs/langs/twig";
import typescript from "@shikijs/langs/typescript";
import vueHtml from "@shikijs/langs/vue-html";
import yaml from "@shikijs/langs/yaml";
import { defineHastPlugin } from "satteri";

import type { Locale } from "./i18n/locale.js";

import { translatorFor } from "./i18n/interface.js";

// One instance per build/module graph, with only the grammars and themes used by docs.
// Oniguruma is the reference TextMate engine. The JS regex port compiles the
// TSX grammar to RegExp lazily, which dominates highlighting; this one runs the
// patterns in WASM.
const highlighter = await createHighlighterCore({
  langs: [
    bash,
    handlebars,
    javascript,
    jsx,
    json,
    php,
    pug,
    twig,
    typescript,
    tsx,
    html,
    vueHtml,
    yaml,
  ],
  themes: [createCssVariablesTheme()],
  engine: await createOnigurumaEngine(getWasm),
});
const languages = new Set(highlighter.getLoadedLanguages());
const aliases: Record<string, string> = {
  xml: "html",
  shell: "bash",
  ejs: "html",
  mustache: "handlebars",
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
        if (canonical && languages.has(canonical)) {
          const source = code.children
            .map((child) => (child.type === "text" ? child.value : ""))
            .join("");
          const highlighted = highlighter.codeToHast(source, {
            lang: canonical,
            theme: "css-variables",
          });
          const pre = highlighted.children.find(
            (child) => child.type === "element" && child.tagName === "pre",
          );
          const tokens =
            pre?.type === "element"
              ? pre.children.find((child) => child.type === "element" && child.tagName === "code")
              : undefined;
          if (tokens?.type === "element")
            renderedPre = {
              ...node,
              children: [
                {
                  ...code,
                  children: tokens.children.filter(
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
