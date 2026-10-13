import { raw } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";
import { readFile } from "node:fs/promises";

import { isIconName, type IconName } from "../lib/icons.js";

export interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  color?: string;
  ariaHidden?: boolean;
}

export async function getIcon(
  name: IconName,
  { size = 20, class: className, color, ariaHidden = true }: Omit<IconProps, "name"> = {},
) {
  if (!isIconName(name)) throw new Error(`Unknown local icon ${name}`);
  const svg = await readFile(
    new URL(`../icons/${name.slice("tabler:".length)}.svg`, import.meta.url),
    "utf8",
  );
  return raw(
    svg.replace(/<svg\b([^>]*)>/, (_, attrs: string) => {
      const dimensions = attrs
        .replace(/\bwidth="[^"]*"/, `width="${size}"`)
        .replace(/\bheight="[^"]*"/, `height="${size}"`)
        .replace(/\sclass="[^"]*"/, "");
      const classes = [className, color].filter(Boolean).join(" ");
      return `<svg${ariaHidden ? ' aria-hidden="true"' : ""}${classes ? ` class="${escapeAttr(classes)}"` : ""}${dimensions}>`;
    }),
  );
}

export function Icon({ name, ...props }: IconProps) {
  return getIcon(name, props);
}
