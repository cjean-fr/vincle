import { useTranslation } from "../lib/context.js";
import { Icon } from "./Icon.js";

export function GitHubLink() {
  const t = useTranslation();
  return (
    <a
      href="https://github.com/cjean-fr/vincle"
      class="docs-github-link inline-grid h-9 w-9 place-items-center rounded-lg text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]"
      aria-label={t("githubRepository")}
      title={t("githubRepository")}
    >
      <Icon name="tabler:brand-github" size={20} class="size-5" />
    </a>
  );
}
