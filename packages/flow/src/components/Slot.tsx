import type { JSX } from "@vincle/core";

import { renderPlaceholder } from "../context.js";

export interface SlotProps {
  name: string;
  children?: JSX.Element;
}

export function Slot(props: SlotProps): JSX.Element {
  const { name, children } = props;
  return renderPlaceholder(name, children);
}
