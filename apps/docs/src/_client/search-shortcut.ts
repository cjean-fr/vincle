/**
 * The label for the shortcut that opens search, or null where none applies:
 * touch-first devices have no keyboard to press it on.
 */
export function shortcutLabel(platform: string, hasKeyboard: boolean): string | null {
  if (!hasKeyboard) return null;
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K";
}

/** Reveal the shortcut hint for this browser; the markup ships it hidden and empty. */
export function showSearchShortcut(): void {
  const label = shortcutLabel(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform,
    matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  if (label === null) return;
  for (const hint of document.querySelectorAll<HTMLElement>("[data-search-shortcut]")) {
    hint.textContent = label;
    hint.hidden = false;
  }
}
