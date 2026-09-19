/** @jsxImportSource @vincle/core */
import { CheckIcon, XIcon } from "./components/Icons.js";

const base = { CheckIcon, XIcon };

export function useMDXComponents(
  components?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...components };
}
