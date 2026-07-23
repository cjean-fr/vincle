// ── HTML text escaping ──────────────────────────────────────────────────

const RE_ESCAPE_HTML = /[&<>]/;

export function escapeHtml(str: string): string {
  const first = str.search(RE_ESCAPE_HTML);
  if (first === -1) return str;

  let out = str.slice(0, first);
  let start = first;
  for (let i = first; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; } // <
    else if (c === 62) { out += str.slice(start, i) + "&gt;";   start = i + 1; } // >
  }
  return out + str.slice(start);
}

// ── Rawtext tag content escaping (script/style) ─────────────────────────

export const RAWTEXT_TAGS = new Set(["script", "style"]);

// Two regexes per rawtext tag: a non-global matcher for the common
// "no close tag present" fast path (one scan, no allocation), and a global
// one used only to iterate matches once at least one close tag is present.
// Iterating with a global regex avoids allocating a lowercased copy of the
// whole body just to do a case-insensitive indexOf.
const RAWTEXT_FIND = new Map<string, RegExp>();
const RAWTEXT_ITER = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  RAWTEXT_FIND.set(tag, new RegExp("</" + tag, "i"));
  RAWTEXT_ITER.set(tag, new RegExp("</" + tag, "gi"));
}

// ── Attribute value escaping ─────────────────────────────────────────────
//
// Escapes characters necessary to safely embed a value in a double-quoted
// HTML attribute (`name="value"`):
//   & → &amp;  (prevents entity injection)
//   " → &quot; (prevents attribute breakout)
//   < → &lt;   (defense-in-depth: XML compat, email clients)
//
// Per HTML5 spec, only & and " are strictly required inside double-quoted
// attribute values. < is technically valid but kept for safety in email/XHTML
// contexts where the parser might not follow the HTML5 spec.

const RE_ESCAPE_ATTR = /[&<"]/;

export function escapeAttr(str: string): string {
  const first = str.search(RE_ESCAPE_ATTR);
  if (first === -1) return str;

  let out = str.slice(0, first);
  let start = first;
  for (let i = first; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 34) { out += str.slice(start, i) + "&quot;"; start = i + 1; } // "
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; } // <
  }
  return out + str.slice(start);
}

export function escapeRawTagContent(str: string, tag: string): string {
  const find = RAWTEXT_FIND.get(tag);
  if (find === undefined) return escapeHtml(str);

  const first = find.exec(str); // non-global: no lastIndex bookkeeping, cheap no-match scan
  if (first === null) return str;

  const re = RAWTEXT_ITER.get(tag)!;
  const skip = 2 + tag.length; // length of the matched "</tag"
  let out = "", last = 0;
  re.lastIndex = first.index;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const idx = m.index;
    out += str.slice(last, idx) + "<\\" + str.slice(idx + 1, idx + skip);
    last = idx + skip;
    re.lastIndex = last;
  }
  return out + str.slice(last);
}
