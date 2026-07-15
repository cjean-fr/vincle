const STORAGE_PREFIX = "docs-tabs-sync:";

function activate(container: Element, index: number): void {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-docs-tab-target]"),
  );
  const panels = Array.from(container.querySelectorAll<HTMLElement>("[data-docs-tab-panel]"));
  buttons.forEach((btn, i) => {
    const active = i === index;
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.classList.toggle("border-blue-500", active);
    btn.classList.toggle("text-blue-600", active);
    btn.classList.toggle("dark:text-blue-400", active);
    btn.classList.toggle("border-transparent", !active);
    btn.classList.toggle("text-gray-600", !active);
    btn.classList.toggle("dark:text-gray-400", !active);
  });
  panels.forEach((panel, i) => {
    panel.classList.toggle("active", i === index);
  });
}

function activateByLabel(container: Element, label: string): boolean {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-docs-tab-target]"),
  );
  const idx = buttons.findIndex((b) => b.dataset["docsTabLabel"] === label);
  if (idx === -1) return false;
  activate(container, idx);
  return true;
}

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  const btn = target?.closest<HTMLButtonElement>("[data-docs-tab-target]");
  if (!btn) return;
  const container = btn.closest(".docs-tabs");
  if (!container) return;
  const idx = Number(btn.dataset["docsTabTarget"]);
  if (Number.isNaN(idx)) return;
  activate(container, idx);

  const syncKey = container.getAttribute("data-docs-tabs-sync");
  const label = btn.dataset["docsTabLabel"];
  if (syncKey && label) {
    try {
      localStorage.setItem(STORAGE_PREFIX + syncKey, label);
    } catch {
      /* ignore */
    }
    for (const other of document.querySelectorAll(
      `[data-docs-tabs-sync="${cssEscape(syncKey)}"]`,
    )) {
      if (other === container) continue;
      activateByLabel(other, label);
    }
  }
});

for (const container of document.querySelectorAll("[data-docs-tabs-sync]")) {
  const syncKey = container.getAttribute("data-docs-tabs-sync");
  if (!syncKey) continue;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_PREFIX + syncKey);
  } catch {
    /* ignore */
  }
  if (stored) activateByLabel(container, stored);
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/["\\]/g, "\\$&");
}

export {};
