/**
 * The label for the shortcut that opens search, or null where none applies:
 * touch-first devices have no keyboard to press it on.
 */
export function shortcutLabel(platform: string, hasKeyboard: boolean): string | null {
  if (!hasKeyboard) return null;
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K";
}

/** Reveal the keyboard hints for this browser; the markup ships them hidden. */
export function showSearchShortcut(): void {
  const hasKeyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const label = shortcutLabel(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform,
    hasKeyboard,
  );
  if (label === null) return;
  for (const hint of document.querySelectorAll<HTMLElement>("[data-search-shortcut]"))
    hint.textContent = label;
  for (const hint of document.querySelectorAll<HTMLElement>(
    "[data-search-shortcut], [data-search-keyboard-hint]",
  ))
    hint.hidden = false;
}
