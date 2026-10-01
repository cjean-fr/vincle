/** Keep partially implemented native patching from consuming templates owned by the polyfill. */
export function prepareNativeTemplates(html: string): { html: string; active: boolean } {
  const lower = html.toLowerCase();
  let from = 0;
  let inertDepth = 0;
  let hasActive = false;
  const targets: number[] = [];
  while (from < html.length) {
    const start = lower.indexOf("<", from);
    if (start === -1) break;
    if (lower.startsWith("<!--", start)) {
      const close = lower.indexOf("-->", start + 4);
      if (close === -1) break;
      from = close + 3;
      continue;
    }
    let i = start + 1;
    const closing = html[i] === "/";
    if (closing) i++;
    const nameStart = i;
    while (i < html.length && !space(html[i]!) && html[i] !== ">" && html[i] !== "/") i++;
    const tag = lower.slice(nameStart, i);
    let active = false;
    while (i < html.length && html[i] !== ">") {
      if (space(html[i]!) || html[i] === "/") {
        i++;
        continue;
      }
      const attrStart = i;
      while (
        i < html.length &&
        !space(html[i]!) &&
        html[i] !== "=" &&
        html[i] !== ">" &&
        html[i] !== "/"
      )
        i++;
      const attr = lower.slice(attrStart, i);
      if (attr === "src" || attr === "for" || attr === "data-for") active = true;
      if (tag === "template" && !closing && attr === "for") targets.push(attrStart);
      while (i < html.length && space(html[i]!)) i++;
      if (html[i] === "=") {
        i++;
        while (i < html.length && space(html[i]!)) i++;
        const quote = html[i];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, i + 1);
          if (end === -1) break;
          i = end + 1;
        } else {
          while (i < html.length && !space(html[i]!) && html[i] !== ">") i++;
        }
      }
    }
    from = i + 1;
    if (tag === "template") {
      if (closing) inertDepth = Math.max(0, inertDepth - 1);
      else {
        if (inertDepth === 0 && active) hasActive = true;
        inertDepth++;
      }
    } else if (
      !closing &&
      [
        "script",
        "style",
        "textarea",
        "title",
        "xmp",
        "iframe",
        "noembed",
        "noframes",
        "noscript",
      ].includes(tag)
    ) {
      let close = lower.indexOf(`</${tag}`, from);
      while (close !== -1) {
        const next = lower[close + tag.length + 2];
        if (next === ">" || next === "/" || (next !== undefined && space(next))) break;
        close = lower.indexOf(`</${tag}`, close + tag.length + 2);
      }
      if (close === -1) break;
      from = close;
    } else if (!closing && tag === "plaintext") break;
  }
  let fromTarget = 0;
  const parts: string[] = [];
  for (const target of targets) {
    parts.push(html.slice(fromTarget, target), "data-");
    fromTarget = target;
  }
  parts.push(html.slice(fromTarget));
  return { html: parts.join(""), active: hasActive };
}

const space = (char: string): boolean =>
  char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
