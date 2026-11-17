import { t } from "../../lib/messages.js";

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-docs-copy]")) {
  const block = button.closest(".docs-code-block")?.querySelector("pre > code");
  if (!block || !navigator.clipboard?.writeText) continue;
  button.hidden = false;
  const label = button.getAttribute("aria-label") ?? t("copyCode");
  const copied = button.dataset["docsCopied"] ?? t("copiedCode");
  const failed = t("copyFailed");
  const tooltip = button.parentElement?.querySelector<HTMLElement>(".docs-copy-tooltip");
  let copying = false;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, attribute: "data-copied" | "data-failed", delay: number): void {
    button.toggleAttribute("data-copied", attribute === "data-copied");
    button.toggleAttribute("data-failed", attribute === "data-failed");
    button.removeAttribute("title");
    button.setAttribute("aria-label", text);
    if (tooltip) tooltip.textContent = text;
    resetTimer = setTimeout(reset, delay);
  }

  function reset(): void {
    button.removeAttribute("data-copied");
    button.removeAttribute("data-failed");
    button.title = label;
    button.setAttribute("aria-label", label);
    if (tooltip) tooltip.textContent = "";
  }

  button.addEventListener("click", async () => {
    // A second click while the clipboard write is in flight is ignored: the
    // write is not cancellable, and two writes would race one reset timer.
    if (copying) return;
    copying = true;
    clearTimeout(resetTimer);
    try {
      await navigator.clipboard.writeText(block.textContent ?? "");
      show(copied, "data-copied", 1500);
    } catch {
      show(failed, "data-failed", 2500);
    } finally {
      copying = false;
    }
  });
}
