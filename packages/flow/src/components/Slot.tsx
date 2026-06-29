import { useContext, type VincleNode, type JSX } from "@vincle/core";
import { Flow } from "../context.js";

export interface SlotProps {
  name: string;
  children?: VincleNode;
}

export function Slot(props: SlotProps): JSX.Element | null {
  const { config } = useContext(Flow);
  const adapter = config.adapter;
  const { name, children } = props;

  if (!adapter)
    throw new Error(
      "Slot requires an adapter. " +
        "Pass { adapter: ... } to renderToStatic " +
        "or use an adapter with renderStream.",
    );

  return adapter.Placeholder({
    id: name,
    src: config.mode === "static" ? config.generatePath(name) : null,
    children: children ?? null,
  }) as JSX.Element | null;
}
