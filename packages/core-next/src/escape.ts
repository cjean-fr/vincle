// ── HTML text escaping ──────────────────────────────────────────────────

const RE_ESCAPE_HTML = /[&<>]/;

export function escapeHtml(str: string): string {
  if (!RE_ESCAPE_HTML.test(str)) return str;
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; } // <
    else if (c === 62) { out += str.slice(start, i) + "&gt;";   start = i + 1; } // >
  }
  return start === 0 ? str : out + str.slice(start);
}

// ── Rawtext tag content escaping (script/style) ─────────────────────────

export const RAWTEXT_TAGS = new Set(["script", "style"]);

const RAWTEXT_RE = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  RAWTEXT_RE.set(tag, new RegExp("</" + tag, "i"));
}

export function escapeRawTagContent(str: string, tag: string): string {
  if (!RAWTEXT_TAGS.has(tag)) return escapeHtml(str);
  const re = RAWTEXT_RE.get(tag)!;
  const m = re.exec(str);
  if (!m) return str;

  const tagLen = tag.length;
  const closeTagLow = `</${tag.toLowerCase()}`;
  const lower = str.toLowerCase();
  let out = "", last = 0;
  let idx = m.index;

  while (idx !== -1) {
    out += str.slice(last, idx) + `<\\${str.slice(idx + 1, idx + 2 + tagLen)}`;
    last = idx + 2 + tagLen;
    idx = lower.indexOf(closeTagLow, last);
  }

  return out + str.slice(last);
}
