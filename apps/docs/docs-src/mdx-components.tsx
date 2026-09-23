/** @jsxImportSource @vincle/core */
import { raw } from "@vincle/core";

import { CheckIcon, XIcon } from "./components/Icons.js";

function RawHtml({ html }: { html: string }) {
  return raw(html);
}

const base = { CheckIcon, XIcon, RawHtml };

export function useMDXComponents(
  components?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...components };
}
