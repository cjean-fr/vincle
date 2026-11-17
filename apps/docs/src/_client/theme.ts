import { applyTheme, nextTheme, type ThemePreference } from "../lib/theme.js";

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
applyTheme();

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("[data-docs-theme-toggle]"))
    return;
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const current = document.documentElement.dataset["theme"] as ThemePreference;
  const preference = nextTheme(current, systemDark);

  applyTheme(preference);
  try {
    if (preference === "auto") localStorage.removeItem("docs-theme");
    else localStorage.setItem("docs-theme", preference);
  } catch {
    // Keep the selection for this page when storage is unavailable.
  }
});

systemTheme.addEventListener("change", () => {
  if (document.documentElement.dataset["theme"] === "auto") applyTheme("auto");
});
window.addEventListener("storage", (event) => {
  if (event.key === "docs-theme" || event.key === null) applyTheme();
});
