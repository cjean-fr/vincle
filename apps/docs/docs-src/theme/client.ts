import { applyTheme, type ThemePreference } from "./state.js";

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
applyTheme();

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("[data-docs-theme-toggle]"))
    return;
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const current = document.documentElement.dataset["theme"] as ThemePreference;
  let preference: ThemePreference;

  if (current === "auto") {
    // auto → propose the opposite of system
    preference = systemDark ? "light" : "dark";
  } else if (current === "dark") {
    // manual dark → opposite is light
    // if system prefers light, offer auto (same result)
    // otherwise offer manual light
    if (systemDark) preference = "light";
    else preference = "auto";
  } else {
    // manual light → opposite is dark
    // if system prefers light, offer manual dark
    // otherwise offer auto (same result)
    if (systemDark) preference = "auto";
    else preference = "dark";
  }

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
