const STORAGE_PREFIX = "docs-tabs-sync:";

function activate(container: Element, index: number): void {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-docs-tab-target]"),
  );
  const panels = Array.from(container.querySelectorAll<HTMLElement>("[data-docs-tab-panel]"));
  buttons.forEach((btn, i) => {
    const active = i === index;
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.tabIndex = active ? 0 : -1;
    btn.classList.toggle("border-blue-500", active);
    btn.classList.toggle("text-blue-600", active);
    btn.classList.toggle("dark:text-blue-400", active);
    btn.classList.toggle("border-transparent", !active);
    btn.classList.toggle("text-gray-600", !active);
    btn.classList.toggle("dark:text-gray-400", !active);
  });
  panels.forEach((panel, i) => {
    const active = i === index;
    panel.classList.toggle("active", active);
    panel.toggleAttribute("hidden", !active);
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

document.addEventListener("keydown", (event) => {
  const target = event.target as Element | null;
  const tab = target?.closest<HTMLButtonElement>('[role="tab"][data-docs-tab-target]');
  const container = tab?.closest(".docs-tabs");
  if (!tab || !container) return;

  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.indexOf(tab);
  if (index < 0 || tabs.length === 0) return;

  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;

  event.preventDefault();
  activate(container, next);
  tabs[next]!.focus();

  const syncKey = container.getAttribute("data-docs-tabs-sync");
  const label = tabs[next]!.dataset["docsTabLabel"];
  if (syncKey && label) {
    try {
      localStorage.setItem(STORAGE_PREFIX + syncKey, label);
    } catch {
      /* ignore */
    }
    for (const other of document.querySelectorAll(
      `[data-docs-tabs-sync="${cssEscape(syncKey)}"]`,
    )) {
      if (other !== container) activateByLabel(other, label);
    }
  }
});

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
