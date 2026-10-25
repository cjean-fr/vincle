import { t } from "../lib/messages.js";
import { applyTheme } from "../lib/theme.js";
import { Icon } from "./Icon.js";

export function ThemeToggle() {
  return (
    <button
      type="button"
      data-docs-theme-toggle
      class="docs-theme-toggle inline-grid h-9 w-9 place-items-center rounded-lg text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]"
      aria-label={t("themeInitial")}
      title={t("themeInitial")}
      data-theme-auto-dark={t("themeAutoDark")}
      data-theme-auto-light={t("themeAutoLight")}
      data-theme-light-dark={t("themeLightAuto")}
      data-theme-light-light={t("themeLightDark")}
      data-theme-dark-dark={t("themeDarkLight")}
      data-theme-dark-light={t("themeDarkAuto")}
    >
      <Icon name="tabler:sun" class="docs-theme-toggle-icon docs-theme-toggle-sun" />
      <Icon name="tabler:moon" class="docs-theme-toggle-icon docs-theme-toggle-moon" />
    </button>
  );
}

export const themeInitScriptSource = `(${applyTheme.toString()})();`;
