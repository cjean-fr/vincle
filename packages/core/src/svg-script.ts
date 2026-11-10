// Temporary mitigation, until the renderer knows the namespace of the element
// it renders: the text of a `<script>` under `<svg>` is not raw text for the
// HTML parser, so a `<` in it opens a tag and an `<img>` leaves the `<svg>`.
//
// This runs once on the finished string and escapes every `<` of an svg script
// body except the closing `</script`. It is deliberately narrow:
//   - only `<script>`, only under `<svg>` (not `<style>`, not MathML);
//   - `<svg>` and `<foreignObject>` are the only elements it follows: a script
//     inside a `<foreignObject>` is an HTML script and is left alone, until a
//     nested `<svg>` opens again;
//   - it reads tags with a quote-aware scan, not a parser: a tag written inside
//     a comment or a CDATA section is read as a tag, and so are the other tags
//     that leave foreign content (`<svg><div>`), see `security.mdx`.
// Content from `raw()` inside such a body is rewritten too: the output is a
// string by then, and the body is escaped whatever its source.

const RE_TAG = /<(\/?)(svg|foreignobject|script)(?=[\s/>])/gi;
const RE_SCRIPT_CLOSE = /<\/script(?=[\s/>])/gi;
const RE_LESS_THAN = /</g;

/** The index after the `>` that ends the start tag read from `from`, or -1. A `>` in a quoted value does not end it. */
function tagEnd(html: string, from: number): number {
  let quote = 0;
  for (let i = from; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (quote !== 0) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) {
      quote = c;
    } else if (c === 62) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Escape the `<` of every `<script>` body that sits under an `<svg>`, except
 * the `</script` that closes it.
 *
 * @internal
 */
export function escapeSvgScripts(html: string): string {
  // The gate is two literal searches, not a case-insensitive regex: on a page of
  // tens of kilobytes the regex alone cost a third of the render. A mixed-case
  // `<Svg` is not seen by it.
  if (!html.includes("<svg") && !html.includes("<SVG")) return html;
  // The enclosing svg / foreignObject elements, innermost last.
  const open: Array<"svg" | "fo"> = [];
  let out = "";
  let copied = 0;
  RE_TAG.lastIndex = 0;
  for (let m = RE_TAG.exec(html); m !== null; m = RE_TAG.exec(html)) {
    const end = tagEnd(html, RE_TAG.lastIndex);
    if (end === -1) break;
    const closing = m[1] === "/";
    const selfClosing = html.charCodeAt(end - 2) === 47; // "/"
    const name = m[2]!.toLowerCase();
    if (name === "script") {
      if (closing || selfClosing || open[open.length - 1] !== "svg") {
        RE_TAG.lastIndex = end;
        continue;
      }
      RE_SCRIPT_CLOSE.lastIndex = end;
      const close = RE_SCRIPT_CLOSE.exec(html);
      const bodyEnd = close === null ? html.length : close.index;
      const body = html.slice(end, bodyEnd);
      if (body.includes("<")) {
        out += html.slice(copied, end) + body.replace(RE_LESS_THAN, "&lt;");
        copied = bodyEnd;
      }
      RE_TAG.lastIndex = bodyEnd;
      continue;
    }
    RE_TAG.lastIndex = end;
    const kind = name === "svg" ? "svg" : "fo";
    if (closing) {
      const at = open.lastIndexOf(kind);
      if (at !== -1) open.length = at;
    } else if (!selfClosing && (kind === "svg" || open[open.length - 1] === "svg")) {
      open.push(kind);
    }
  }
  return copied === 0 ? html : out + html.slice(copied);
}
