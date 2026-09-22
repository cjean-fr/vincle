import { defineHastPlugin, type HastContent } from "satteri";

export const wrapTables = defineHastPlugin({
  name: "wrap-tables",
  element: {
    filter: ["table"],
    visit(node) {
      return {
        type: "element",
        tagName: "div",
        properties: { className: ["docs-table-wrapper"] },
        children: [node],
      };
    },
  },
});

const TAB_META = /\btab\s*=\s*"([^"]*)"/;
const SYNC_META = /\bsync\s*=\s*"([^"]*)"/;

/** The element variants of satteri's hast node union. */
type HastElement = Extract<HastContent, { type: "element" }>;

function metaOf(node: unknown): string | undefined {
  const code = (node as { children?: readonly unknown[] } | undefined)?.children?.[0] as
    | { type?: string; tagName?: string; data?: { meta?: unknown } }
    | undefined;
  if (code?.type !== "element" || code.tagName !== "code") return undefined;
  return typeof code.data?.meta === "string" ? code.data.meta : undefined;
}

function tabLabel(node: unknown): string | undefined {
  return TAB_META.exec(metaOf(node) ?? "")?.[1];
}

function isTabFence(node: unknown): boolean {
  const el = node as { type?: string; tagName?: string } | undefined;
  return el?.type === "element" && el.tagName === "pre" && tabLabel(node) !== undefined;
}

function isBlankText(node: unknown): boolean {
  const el = node as { type?: string; value?: unknown } | undefined;
  return el?.type === "text" && typeof el.value === "string" && el.value.trim() === "";
}

/**
 * Consecutive fences carrying a `tab="label"` meta become one tab group:
 *
 * ```bash tab="npm" sync="pkg-manager"
 * npm install @vincle/core
 * ```
 *
 * ```bash tab="bun" sync="pkg-manager"
 * bun add @vincle/core
 * ```
 *
 * Groups sharing a `sync` key share their active tab across pages: see
 * `tabs/client.ts`. The emitted DOM matches the former JSX `<Tabs>`
 * component, so the client script and the CSS are untouched.
 */
export const fenceTabs = defineHastPlugin({
  name: "fence-tabs",
  element: {
    filter: ["pre"],
    visit(node, ctx) {
      if (tabLabel(node) === undefined) return;

      const parent = ctx.parent(node);
      const index = parent ? ctx.indexOf(node) : undefined;
      if (!parent || index === undefined) return;

      const children = parent.children;

      // Only the first fence of a run groups it; a tabbed sibling before it
      // means an earlier visit already wrapped this group.
      let prev = index - 1;
      while (prev >= 0 && isBlankText(children[prev])) prev--;
      if (prev >= 0 && isTabFence(children[prev])) return;

      const run: HastElement[] = [node];
      let next = index + 1;
      while (next < children.length) {
        const sibling = children[next];
        if (sibling === undefined) break;
        if (isBlankText(sibling)) {
          next++;
          continue;
        }
        if (!isTabFence(sibling)) break;
        run.push(sibling as HastElement);
        next++;
      }
      if (run.length < 2) return; // A lone tab is just a code block.

      let sync: string | undefined;
      for (const pre of run) {
        sync = SYNC_META.exec(metaOf(pre) ?? "")?.[1];
        if (sync !== undefined) break;
      }

      const container: HastContent = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["docs-tabs", "my-4"],
          ...(sync !== undefined ? { "data-docs-tabs-sync": sync } : {}),
        },
        children: [
          {
            type: "element",
            tagName: "div",
            properties: {
              className: [
                "docs-tabs-header",
                "flex",
                "border-b",
                "border-gray-200",
                "dark:border-gray-800",
              ],
            },
            children: run.map((pre, i) => {
              const label = tabLabel(pre)!;
              const active = i === 0;
              return {
                type: "element" as const,
                tagName: "button",
                properties: {
                  type: "button",
                  "data-docs-tab-target": String(i),
                  "data-docs-tab-label": label,
                  "aria-selected": active ? "true" : "false",
                  className: [
                    "px-4",
                    "py-2",
                    "text-sm",
                    "font-medium",
                    "border-b-2",
                    ...(active
                      ? ["border-blue-500", "text-blue-600", "dark:text-blue-400"]
                      : ["border-transparent", "text-gray-600", "dark:text-gray-400"]),
                  ],
                },
                children: [{ type: "text", value: label }],
              };
            }),
          },
          ...run.map((pre, i) => ({
            type: "element" as const,
            tagName: "div",
            properties: {
              "data-docs-tab-panel": "",
              className: ["docs-tab-panel", ...(i === 0 ? ["active"] : [])],
            },
            children: [pre],
          })),
        ],
      };

      for (const pre of run.slice(1).toReversed()) ctx.removeNode(pre);
      ctx.replaceNode(node, container);
    },
  },
});
