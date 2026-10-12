/** @jsxImportSource @vincle/core */
import { raw } from "@vincle/core";

function RawHtml({ html }: { html: string }) {
  return raw(html);
}

const base = { RawHtml };

export function useMDXComponents(
  components?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...components };
}
