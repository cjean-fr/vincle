const NAV_SELECTOR = ".docs-nav";
const TOGGLE_SELECTOR = "[data-docs-nav-toggle]";
const BACKDROP_SELECTOR = "[data-docs-nav-backdrop]";

let previousFocus: Element | null = null;

function isOpen(nav: Element): boolean {
  return nav.hasAttribute("data-open");
}

function setOpen(open: boolean): void {
  const nav = document.querySelector<HTMLElement>(NAV_SELECTOR);
  const toggle = document.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR);
  const backdrop = document.querySelector(BACKDROP_SELECTOR);
  const main = document.getElementById("docs-main");
  if (!nav) return;
  if (open) previousFocus = document.activeElement;
  if (open) nav.setAttribute("data-open", "");
  else nav.removeAttribute("data-open");
  nav.toggleAttribute("inert", !open && window.matchMedia("(max-width: 767px)").matches);
  backdrop?.toggleAttribute("data-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute(
    "aria-label",
    toggle.getAttribute(open ? "data-close-label" : "data-open-label") ?? "",
  );
  toggle?.querySelector(".docs-nav-toggle-open")?.toggleAttribute("hidden", open);
  toggle?.querySelector(".docs-nav-toggle-close")?.toggleAttribute("hidden", !open);
  main?.toggleAttribute("inert", open);
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    nav.focus({ preventScroll: true });
  } else if (previousFocus instanceof HTMLElement && !previousFocus.closest("a")) {
    previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
}

// The server renders the mobile navigation inert. On desktop it is visible
// in the document flow and must participate in the tab order immediately.
const desktop = window.matchMedia("(min-width: 768px)");
const syncNavigationInert = () => {
  const nav = document.querySelector<HTMLElement>(NAV_SELECTOR);
  if (nav) nav.toggleAttribute("inert", !desktop.matches);
};
syncNavigationInert();
desktop.addEventListener("change", syncNavigationInert);

// --- Nav open/close click handler ---

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (!target) return;

  if (target.closest(TOGGLE_SELECTOR)) {
    const nav = document.querySelector(NAV_SELECTOR);
    setOpen(nav ? !isOpen(nav) : false);
    return;
  }
  if (target.closest(BACKDROP_SELECTOR)) {
    setOpen(false);
    return;
  }
  const navOpen = document.querySelector(`${NAV_SELECTOR}[data-open]`);
  if (navOpen && target.closest("a")) {
    setOpen(false);
  }
});

// --- Keyboard ---

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const navOpen = document.querySelector(`${NAV_SELECTOR}[data-open]`);
    if (navOpen) setOpen(false);
  }
});

export {};
