const prefetched = new Set<string>();

function prefetch(url: string) {
  if (prefetched.has(url)) return;
  prefetched.add(url);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;
  link.as = "document";
  document.head.appendChild(link);
}

function getNavLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLAnchorElement>(".docs-page-nav a");
}

function onPointerEnter(e: Event) {
  const link = getNavLink(e.target);
  if (link?.href) prefetch(link.href);
}

function onTouchStart(e: Event) {
  const link = getNavLink(e.target);
  if (link?.href) prefetch(link.href);
}

function init() {
  const nav = document.querySelector(".docs-page-nav");
  if (!nav) return;

  nav.addEventListener("mouseover", onPointerEnter, { passive: true });
  nav.addEventListener("touchstart", onTouchStart, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
