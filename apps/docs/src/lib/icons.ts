export const iconNames = [
  "tabler:sun",
  "tabler:moon",
  "tabler:menu-2",
  "tabler:x",
  "tabler:search",
  "tabler:chevron-left",
  "tabler:chevron-right",
] as const;

export type IconName = (typeof iconNames)[number];
const names: ReadonlySet<string> = new Set(iconNames);
export function isIconName(name: string): name is IconName {
  return names.has(name);
}
