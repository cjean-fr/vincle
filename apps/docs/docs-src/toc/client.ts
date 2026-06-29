export interface ScrollSpyOptions {
  markerSelector?: string;
  linkSelector?: string;
  sublistSelector?: string;
  headingSelector?: string;
  activeClass?: string;
  animatingClass?: string;
  offset?: number;
}

const DEFAULTS = {
  markerSelector: ".docs-toc-marker",
  linkSelector: ".docs-toc-link",
  sublistSelector: ".docs-toc-sublist",
  headingSelector: "main h2[id], main h3[id]",
  activeClass: "is-active",
  animatingClass: "is-animating",
  offset: 32,
} satisfies Required<ScrollSpyOptions>;

export function installScrollSpy(
  toc: HTMLElement,
  opts: ScrollSpyOptions = {},
): () => void {
  const o = { ...DEFAULTS, ...opts };

  if (typeof window === "undefined") return () => {};

  const headings = Array.from(
    document.querySelectorAll<HTMLElement>(o.headingSelector),
  );
  if (headings.length === 0) return () => {};

  const marker = toc.querySelector<HTMLElement>(o.markerSelector);
  const track = marker?.parentElement ?? null;
  const links = Array.from(
    toc.querySelectorAll<HTMLAnchorElement>(o.linkSelector),
  );

  ensureAnimatingCss(o.animatingClass, o.markerSelector);

  let activeId = "";
  let rafId: number | null = null;
  let animCount = 0;

  function getActiveId(): string {
    const scrollBottom = window.scrollY + window.innerHeight;
    const threshold = window.scrollY + o.offset;
    const isAtBottom =
      scrollBottom >= document.documentElement.scrollHeight - 2;
    let result = headings[0]!.id;
    for (const h of headings) {
      if (h.offsetTop <= threshold || isAtBottom) result = h.id;
    }
    return result;
  }

  function placeMarker(): void {
    if (!marker || !track) return;
    const activeLink = toc.querySelector<HTMLElement>(`.${o.activeClass}`);
    if (!activeLink) return;
    let top = 0;
    let el: HTMLElement | null = activeLink;
    while (el && el !== track) {
      top += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    marker.style.top = `${top}px`;
    marker.style.height = `${activeLink.offsetHeight}px`;
  }

  // During sublist collapse/expand, suppress the CSS transition on the marker
  // and track the active link's position frame-by-frame so the marker follows
  // the link as it moves (instead of animating toward a stale position).
  // animCount handles simultaneous animations (one collapse + one expand).
  function startTracking(): void {
    animCount++;
    if (rafId !== null) return;
    track?.classList.add(o.animatingClass);
    const loop = (): void => {
      placeMarker();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function stopTracking(): void {
    animCount = Math.max(0, animCount - 1);
    if (animCount > 0) return;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    track?.classList.remove(o.animatingClass);
    placeMarker();
  }

  function updateActive(): void {
    const newId = getActiveId();
    if (newId === activeId) return;
    activeId = newId;
    for (const link of links) {
      const active = link.getAttribute("href") === `#${activeId}`;
      link.classList.toggle(o.activeClass, active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    placeMarker();
  }

  function isSublistTransition(e: TransitionEvent): boolean {
    return (
      e.target instanceof HTMLElement &&
      e.target.matches(o.sublistSelector) &&
      e.propertyName === "max-height"
    );
  }

  const onTransitionStart = (e: TransitionEvent) => {
    if (isSublistTransition(e)) startTracking();
  };
  const onTransitionEnd = (e: TransitionEvent) => {
    if (isSublistTransition(e)) stopTracking();
  };
  const onTransitionCancel = (e: TransitionEvent) => {
    if (isSublistTransition(e)) stopTracking();
  };

  window.addEventListener("scroll", updateActive, { passive: true });
  window.addEventListener("resize", placeMarker, { passive: true });
  toc.addEventListener("transitionstart", onTransitionStart);
  toc.addEventListener("transitionend", onTransitionEnd);
  toc.addEventListener("transitioncancel", onTransitionCancel);

  updateActive();

  return function destroy(): void {
    window.removeEventListener("scroll", updateActive);
    window.removeEventListener("resize", placeMarker);
    toc.removeEventListener("transitionstart", onTransitionStart);
    toc.removeEventListener("transitionend", onTransitionEnd);
    toc.removeEventListener("transitioncancel", onTransitionCancel);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    track?.classList.remove(o.animatingClass);
  };
}

// Injects the single CSS rule needed for the rAF tracking trick.
// No-ops if already injected (identified by id="toc-spy-styles").
function ensureAnimatingCss(
  animatingClass: string,
  markerSelector: string,
): void {
  if (typeof document === "undefined") return;
  const id = "toc-spy-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `.${animatingClass} ${markerSelector} { transition: none !important; }`;
  document.head.appendChild(style);
}

// Auto-init for direct script usage (non-module context).
const toc = document.querySelector<HTMLElement>(".docs-toc");
if (toc) installScrollSpy(toc);
