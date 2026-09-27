import { Scope, type JSX } from "@vincle/core";

import { Flow, renderPlaceholder } from "../context.js";

export interface SlotProps {
  name: string;
  children?: JSX.Element;
}

export function Slot(props: SlotProps): JSX.Element {
  const { name, children } = props;
  Scope.get(Flow).slots.names.add(name);
  return renderPlaceholder(name, children);
}
