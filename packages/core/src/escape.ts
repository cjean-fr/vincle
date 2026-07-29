// ── HTML text escaping ──────────────────────────────────────────────────

const RE_ESCAPE_HTML = /[&<>]/;

export function escapeContent(str: string): string {
  const first = str.search(RE_ESCAPE_HTML);
  if (first === -1) return str;

  let out = str.slice(0, first);
  let start = first;
  for (let i = first; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38) {
      out += str.slice(start, i) + "&amp;";
      start = i + 1;
    } // &
    else if (c === 60) {
      out += str.slice(start, i) + "&lt;";
      start = i + 1;
    } // <
    else if (c === 62) {
      out += str.slice(start, i) + "&gt;";
      start = i + 1;
    } // >
  }
  return out + str.slice(start);
}

// ── Rawtext tag content escaping (script/style) ─────────────────────────

export const RAWTEXT_TAGS = new Set(["script", "style"]);

/**
 * Does this tag hold rawtext (`<script>` / `<style>`)?
 *
 * Two literal comparisons rather than `RAWTEXT_TAGS.has(tag)`. The set has two
 * members, tag names arrive interned from the JSX transform, and this runs once
 * per element — on the `stack` benchmark a single per-element `Set.has` is worth
 * ~15%, which is what pays for tag-name validation on the same path.
 * `RAWTEXT_TAGS` remains the source of truth for everything else.
 */
export function isRawtextTag(tag: string): boolean {
  return tag === "script" || tag === "style";
}

// Two regexes per rawtext tag: a non-global matcher for the common
// "no close tag present" fast path (one scan, no allocation), and a global
// one used only to iterate matches once at least one close tag is present.
// Iterating with a global regex avoids allocating a lowercased copy of the
// whole body just to do a case-insensitive indexOf.
const RAWTEXT_DETECT = new Map<string, RegExp>();
const RAWTEXT_SCAN = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  RAWTEXT_DETECT.set(tag, new RegExp("</" + tag, "i"));
  RAWTEXT_SCAN.set(tag, new RegExp("</" + tag, "gi"));
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
    if (c === 38) {
      out += str.slice(start, i) + "&amp;";
      start = i + 1;
    } // &
    else if (c === 34) {
      out += str.slice(start, i) + "&quot;";
      start = i + 1;
    } // "
    else if (c === 60) {
      out += str.slice(start, i) + "&lt;";
      start = i + 1;
    } // <
  }
  return out + str.slice(start);
}

export function escapeRawTagContent(str: string, tag: string): string {
  const detectRe = RAWTEXT_DETECT.get(tag);
  if (detectRe === undefined) return escapeContent(str);

  const first = detectRe.exec(str); // non-global: no lastIndex bookkeeping, cheap no-match scan
  if (first === null) return str;

  const scanRe = RAWTEXT_SCAN.get(tag)!;
  const skip = 2 + tag.length; // length of the matched "</tag"
  let out = "",
    last = 0;
  scanRe.lastIndex = first.index;
  let m: RegExpExecArray | null;
  while ((m = scanRe.exec(str)) !== null) {
    const idx = m.index;
    out += str.slice(last, idx) + "<\\" + str.slice(idx + 1, idx + skip);
    last = idx + skip;
    scanRe.lastIndex = last;
  }
  return out + str.slice(last);
}
