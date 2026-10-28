import { createHighlighterCore, createCssVariablesTheme } from "@shikijs/core";
import shikiPackage from "@shikijs/core/package.json" with { type: "json" };
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
import { renderMermaidSVG } from "beautiful-mermaid";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineHastPlugin } from "satteri";

import { t } from "./messages.js";

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

/** Parse `{1,3-5}` line marks from a fence's meta string (shiki convention). */
function parseLineMarks(meta: string): Set<number> {
  const spec = /\{([\d\s,\-]+)\}/.exec(meta)?.[1];
  const marks = new Set<number>();
  if (!spec) return marks;
  for (const part of spec.split(",")) {
    const bounds = part
      .trim()
      .split("-")
      .map((n) => Number.parseInt(n, 10));
    const a = bounds[0];
    const b = bounds[1];
    if (a === undefined || !Number.isInteger(a)) continue;
    if (b !== undefined && Number.isInteger(b) && b >= a) {
      for (let i = a; i <= b; i++) marks.add(i);
    } else marks.add(a);
  }
  return marks;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown; class?: unknown };
  children?: HastNode[];
}

/**
 * Flag marked line spans with a `mark` class so CSS can wash them. Marked
 * blocks drop the newline text nodes between lines and render each line as a
 * block (see .has-marks in the stylesheet), which gives the wash its full
 * width. Cached children are never mutated: marked lines are cloned.
 */
function markLines(children: unknown[], marks: Set<number>): unknown[] {
  let n = 0;
  const out: unknown[] = [];
  for (const child of children as HastNode[]) {
    if (child.type === "text") {
      if (child.value && child.value.trim() === "") continue;
      out.push(child);
      continue;
    }
    if (child.type === "element") {
      // Shiki emits `class` on line spans; satteri's own nodes use `className`.
      const cls = child.properties?.class ?? child.properties?.className;
      const names = Array.isArray(cls) ? cls : [cls];
      if (names.includes("line")) {
        n += 1;
        if (marks.has(n)) {
          const key = child.properties && "class" in child.properties ? "class" : "className";
          out.push({
            ...child,
            properties: { ...child.properties, [key]: [...names, "mark"] },
          });
        } else out.push(child);
        continue;
      }
    }
    out.push(child);
  }
  // The trailing newline produces a final empty line: as a block it would add a
  // blank row at the end of the snippet.
  const last = out[out.length - 1] as HastNode | undefined;
  if (
    last?.type === "element" &&
    (!last.children ||
      last.children.every((c) => c.type === "text" && (c.value ?? "").trim() === ""))
  ) {
    out.pop();
  }
  return out;
}

const THEME = "css-variables";
const cacheDirectory = path.resolve("node_modules/.cache/vincle-docs/highlight");

/**
 * Highlighting dominates the build, so each result is kept on disk, keyed by
 * what determines it: source, language, theme and Shiki version. A miss, a
 * corrupt entry or an unwritable directory just highlights again.
 */
function highlight(source: string, language: string): unknown[] {
  const key = createHash("sha256")
    .update(`${shikiPackage.version}\0${THEME}\0${language}\0${source}`)
    .digest("hex");
  const file = path.join(cacheDirectory, `${key}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown[];
  } catch {}
  const pre = highlighter
    .codeToHast(source, { lang: language, theme: THEME })
    .children.find((child) => child.type === "element" && child.tagName === "pre");
  const tokens =
    pre?.type === "element"
      ? pre.children.find((child) => child.type === "element" && child.tagName === "code")
      : undefined;
  const children =
    tokens?.type === "element"
      ? tokens.children.filter((child) => child.type === "element" || child.type === "text")
      : [];
  try {
    mkdirSync(cacheDirectory, { recursive: true });
    writeFileSync(file, JSON.stringify(children));
  } catch {}
  return children;
}

/**
 * Draw ```mermaid fences as inline SVG at build time. The colors are the docs
 * theme variables, so diagrams follow the light and dark themes. The renderer's
 * web-font import is dropped: the page uses its own fonts. Stylesheets apply to
 * the whole document, so a page keeps each distinct one once. Element ids get
 * the diagram's number, so diagrams never share one. Create one plugin per
 * page.
 */
export function mermaidBlocks() {
  const styles = new Set<string>();
  let count = 0;
  return defineHastPlugin({
    name: "docs-mermaid-blocks",
    element: {
      filter: ["pre"],
      visit(node) {
        const code = node.children[0];
        if (code?.type !== "element" || code.tagName !== "code") return;
        const classes = code.properties.className;
        if (
          !(Array.isArray(classes) ? classes : [classes]).some(
            (name) => name === "language-mermaid",
          )
        )
          return;
        const source = code.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join("");
        let svg = renderMermaidSVG(source, {
          bg: "var(--docs-color-bg)",
          fg: "var(--docs-color-text)",
          line: "var(--docs-color-text-secondary)",
          muted: "var(--docs-color-text-secondary)",
          surface: "var(--docs-color-surface)",
          border: "var(--docs-color-border)",
          accent: "var(--docs-color-accent)",
          font: "inherit",
          padding: 16,
          transparent: true,
        });
        const n = ++count;
        svg = svg
          .replace(/<style>[\s\S]*?<\/style>/, (style) => {
            const css = style.replace(
              /@import url\('https:\/\/fonts\.googleapis\.com[^)]*\);\s*/g,
              "",
            );
            if (styles.has(css)) return "";
            styles.add(css);
            return css;
          })
          .replace(/ id="([^"]+)"/g, (_, id: string) => ` id="${id}-${n}"`)
          .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${id}-${n})`);
        return {
          type: "element",
          tagName: "figure",
          properties: { className: ["docs-diagram"] },
          children: [{ type: "raw", value: svg }],
        };
      },
    },
  });
}

/** Highlight at build time so the first paint already contains token colors. */
export const codeBlocks = defineHastPlugin({
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
      const data: unknown = code.data;
      const meta =
        data && typeof data === "object" && "meta" in data && typeof data.meta === "string"
          ? data.meta
          : "";
      const marks = parseLineMarks(meta);
      let renderedPre = node;
      if (canonical && languages.has(canonical)) {
        const source = code.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join("");
        let children = highlight(source, canonical) as typeof code.children;
        if (marks.size > 0) children = markLines(children, marks) as typeof code.children;
        renderedPre = {
          ...node,
          children: [{ ...code, children }],
        };
      }
      const blockClasses = ["docs-code-block"];
      const title = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
      const label = title?.[1] ?? title?.[2] ?? title?.[3];
      if (label) blockClasses.push("has-title");
      if (marks.size > 0) blockClasses.push("has-marks");
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
