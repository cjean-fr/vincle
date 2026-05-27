import { raw } from "@vincle/core";

const SUN_ICON = raw(
  `<svg class="docs-theme-toggle-icon docs-theme-toggle-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`,
);

const MOON_ICON = raw(
  `<svg class="docs-theme-toggle-icon docs-theme-toggle-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`,
);

export function ThemeToggle() {
  return (
    <button
      type="button"
      data-docs-theme-toggle
      class="docs-theme-toggle inline-grid h-9 w-9 place-items-center rounded-lg text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]"
      aria-label="Toggle theme"
    >
      {SUN_ICON}
      {MOON_ICON}
    </button>
  );
}

export const themeInitScript = raw(
  `<script>(function(){try{var t=localStorage.getItem("docs-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark");var b=document.querySelector("[data-docs-theme-toggle]");if(b)b.setAttribute("aria-pressed","true")}}catch(e){}})();</script>`,
);
