import type { JSX } from "@vincle/core";

import { flowContext, renderPlaceholder } from "../context.js";

export interface SlotProps {
  name: string;
  children?: JSX.Element;
}

export function Slot(props: SlotProps): JSX.Element {
  const { name, children } = props;
  flowContext("<Slot>").slots.names.add(name);
  return renderPlaceholder(name, children);
}
