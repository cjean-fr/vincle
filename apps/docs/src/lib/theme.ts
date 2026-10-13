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
  for (const button of document.querySelectorAll("[data-docs-theme-toggle]")) {
    const label =
      button.getAttribute(`data-theme-${selected}-${systemDark ? "dark" : "light"}`) ?? "";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
}
