import type { VNode } from "@vincle/core";

/** @jsxImportSource @vincle/core */
import { CodeBlock } from "./components/CodeBlock.js";
import { CodeExample } from "./components/CodeExample.js";
import { CheckIcon, XIcon } from "./components/Icons.js";
export interface Tab {
  label: string;
  content: VNode;
}

function Tabs({ tabs, syncKey }: { tabs: Tab[]; syncKey?: string }) {
  if (!tabs || tabs.length === 0) return null;
  return (
    <div class="docs-tabs my-4" data-docs-tabs-sync={syncKey ?? ""}>
      <div class="docs-tabs-header flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab, i) => (
          <button
            type="button"
            data-docs-tab-target={String(i)}
            data-docs-tab-label={tab.label}
            aria-selected={i === 0 ? "true" : "false"}
            class={`px-4 py-2 text-sm font-medium ${i === 0 ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "border-b-2 border-transparent text-gray-600 dark:text-gray-400"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div data-docs-tab-panel class="docs-tabs-panel" hidden={i !== 0 ? true : undefined}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}

const base = { CodeBlock, CodeExample, Tabs, CheckIcon, XIcon };

export function useMDXComponents(
  components?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...components };
}
