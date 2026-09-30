export type ThemePreference = "auto" | "light" | "dark";

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
  const labels = {
    auto: `Theme: Automatic (system ${systemDark ? "dark" : "light"}). Switch to ${systemDark ? "light" : "dark"}`,
    light: systemDark ? "Theme: Light. Return to Automatic" : "Theme: Light. Switch to Dark",
    dark: systemDark ? "Theme: Dark. Switch to Light" : "Theme: Dark. Return to Automatic",
  };
  for (const button of document.querySelectorAll("[data-docs-theme-toggle]")) {
    button.setAttribute("aria-label", labels[selected]);
    button.setAttribute("title", labels[selected]);
  }
}
