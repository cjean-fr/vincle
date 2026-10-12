/** Restore package manager before content paints; CSS selects the initial panel. */
export const tabsInitScriptSource = `try{var p=localStorage.getItem("docs-tabs-sync:pkg-manager");if(p==="npm"||p==="pnpm"||p==="bun")document.documentElement.setAttribute("data-docs-package-manager",p)}catch{}`;
