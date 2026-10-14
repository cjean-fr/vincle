import { useTranslation } from "../lib/context.js";
import { Icon } from "./Icon.js";

export function NavToggle() {
  const t = useTranslation();
  return (
    <button
      type="button"
      data-docs-nav-toggle
      aria-label={t("openNavigation")}
      data-open-label={t("openNavigation")}
      data-close-label={t("closeNavigation")}
      aria-expanded="false"
      aria-controls="docs-nav"
      class="docs-nav-toggle inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)] md:hidden"
    >
      <span class="docs-nav-toggle-open">
        <Icon name="tabler:menu-2" />
      </span>
      <span class="docs-nav-toggle-close" hidden>
        <Icon name="tabler:x" />
      </span>
    </button>
  );
}
