/** @jsxImportSource @vincle/core */
import { raw, type JSX } from "@vincle/core";

function RawHtml({ html }: { html: string }) {
  return raw(html);
}

function Card({ title, children }: { title: string; children?: JSX.Element }) {
  return (
    <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <p class="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      </div>
      <div class="space-y-3 p-4">{children}</div>
    </div>
  );
}

function AgentCallout({ title, children }: { title: string; children?: JSX.Element }) {
  return (
    <aside class="docs-agent-callout">
      <p class="docs-agent-callout-title">{title}</p>
      {children}
    </aside>
  );
}

const base = { RawHtml, Card, AgentCallout };

export function useMDXComponents(
  components?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...components };
}
