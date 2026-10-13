for (const button of document.querySelectorAll<HTMLButtonElement>("[data-docs-copy]")) {
  const block = button.closest(".docs-code-block")?.querySelector("pre > code");
  if (!block || !navigator.clipboard?.writeText) continue;
  button.hidden = false;
  const label = button.getAttribute("aria-label") ?? "";
  const tooltip = button.parentElement?.querySelector<HTMLElement>(".docs-copy-tooltip");
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(block.textContent ?? "");
      const copied = button.dataset["docsCopied"] ?? label;
      button.dataset["copied"] = "";
      button.removeAttribute("title");
      if (tooltip) tooltip.textContent = copied;
      clearTimeout(resetTimer);
      button.setAttribute("aria-label", copied);
      resetTimer = setTimeout(() => {
        delete button.dataset["copied"];
        if (tooltip) tooltip.textContent = "";
        button.title = label;
        button.setAttribute("aria-label", label);
      }, 1500);
    } catch {
      button.title = label;
    }
  });
}
