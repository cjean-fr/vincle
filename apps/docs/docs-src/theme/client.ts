function setTheme(nextDark: boolean): void {
  const html = document.documentElement;
  html.classList.toggle("dark", nextDark);
  try {
    localStorage.setItem("docs-theme", nextDark ? "dark" : "light");
  } catch {
    // localStorage may be unavailable.
  }
}

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  const btn = target?.closest<HTMLButtonElement>("[data-docs-theme-toggle]");
  if (!btn) return;

  const html = document.documentElement;
  const nextDark = !html.classList.contains("dark");
  setTheme(nextDark);
  btn.setAttribute("aria-pressed", String(nextDark));
});

export {};
