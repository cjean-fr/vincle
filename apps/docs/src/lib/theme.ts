export type ThemePreference = "auto" | "light" | "dark";

/**
 * The toggle's transition table. The three preferences form a cycle with the
 * system preference: `auto` picks the opposite system result, a manual theme
 * returns to `auto` once flipping it would reproduce the system result, and
 * only otherwise flips between manual light and dark.
 *
 * ```
 * auto  + system dark  → light
 * auto  + system light → dark
 * dark  + system dark  → light   (auto would repeat dark; go manual instead)
 * dark  + system light → auto    (auto changes the result)
 * light + system dark  → auto    (auto changes the result)
 * light + system light → dark    (auto would repeat light; go manual instead)
 * ```
 */
export function nextTheme(current: ThemePreference, systemDark: boolean): ThemePreference {
  if (current === "auto") return systemDark ? "light" : "dark";
  if (current === "dark") return systemDark ? "light" : "auto";
  return systemDark ? "auto" : "dark";
}

/** Self-contained so the head bootstrap and client use exactly the same logic. */
export function applyTheme(preference?: ThemePreference): void {
  let selected = preference;
  if (!selected) {
    try {
      const stored = localStorage.getItem("docs-theme");
      selected = stored === "light" || stored === "dark" ? stored : "auto";
    } catch {
      selected = "auto";
    }
  }
  const html = document.documentElement;
  html.dataset["theme"] = selected;
  html.classList.toggle(
    "dark",
    selected === "dark" ||
      (selected === "auto" && matchMedia("(prefers-color-scheme: dark)").matches),
  );
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  for (const button of document.querySelectorAll("[data-docs-theme-toggle]")) {
    const label =
      button.getAttribute(`data-theme-${selected}-${systemDark ? "dark" : "light"}`) ?? "";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
}
