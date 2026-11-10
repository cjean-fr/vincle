// Temporary mitigation, until the renderer knows the namespace of the element
// it renders. In an HTML document, the text of a `<script>` or a `<style>` is
// raw text only in the HTML namespace. Under `<svg>` it is ordinary
// markup: a `<` opens a tag, an `&` starts a character reference, and an `<img>`
// in it leaves the foreign element for HTML.
// @see https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign
//
// `serializeElement` hands the finished content of an element whose tag is `svg`
// to `escapeForeignText`, which escapes `&`, `<` and `>` in the body of every
// `<script>` and `<style>` it finds in svg content, except the tag that closes
// the body. Only an `svg` element pays for it. It is best effort:
//   - it follows tags with a quote-aware scan, not a parser. A tag written inside
//     a comment or a CDATA section is read as a tag, and so are the tags that
//     leave foreign content (`<svg><div>`);
//   - it follows the HTML integration points of svg, where the text is HTML
//     again: `foreignObject`, `desc` and `title`;
//   - a nested `svg` element is its own pass and is skipped here, so a nested
//     root that is only written as text (`raw()`, a template) is not scanned;
//   - the walk has already neutralized a `</script` or `</style` in the text
//     (`<\/style`), so that backslash form is what the output keeps;
//   - an `<svg>` that is only written in a template's text (precompiled output,
//     a hand-written `jsxTemplate`) is not an element here and is not seen;
//   - MathML is not handled: `script` and `style` are not MathML vocabulary
//     (https://www.w3.org/TR/mathml-core/), and it is not a root here.
// Content from `raw()` in such a body is rewritten too: it is a string by then.

const RE_TAG = /<(\/?)(svg|foreignobject|desc|title|script|style)(?=[\s/>])/gi;
const RE_SCRIPT_CLOSE = /<\/script(?=[\s/>])/gi;
const RE_STYLE_CLOSE = /<\/style(?=[\s/>])/gi;
const RE_TEXT_UNSAFE = /[&<>]/g;

const TEXT_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeChar(c: string): string {
  return TEXT_ESCAPES[c]!;
}

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
 * Escape `&`, `<` and `>` in every `<script>` and `<style>` body found in the
 * content of an `<svg>` element, except the tag that closes
 * the body.
 *
 * @internal
 */
export function escapeForeignText(html: string): string {
  // The open elements that change what the text is, innermost last: "f" is
  // foreign content, "h" an HTML integration point, "p" a nested `svg` or
  // `math`, whose bodies its own element has already escaped: escaping them
  // again would turn `&lt;` into `&amp;lt;`. The content starts inside the root
  // it belongs to.
  const names: string[] = [""];
  const kinds: Array<"f" | "h" | "p"> = ["f"];
  let out = "";
  let copied = 0;
  RE_TAG.lastIndex = 0;
  for (let m = RE_TAG.exec(html); m !== null; m = RE_TAG.exec(html)) {
    const end = tagEnd(html, RE_TAG.lastIndex);
    if (end === -1) break;
    const closing = m[1] === "/";
    const selfClosing = html.charCodeAt(end - 2) === 47; // "/"
    const name = m[2]!.toLowerCase();
    const foreign = kinds[kinds.length - 1] === "f";
    if (name === "script" || name === "style") {
      if (closing || selfClosing || !foreign) {
        RE_TAG.lastIndex = end;
        continue;
      }
      const re = name === "script" ? RE_SCRIPT_CLOSE : RE_STYLE_CLOSE;
      re.lastIndex = end;
      const close = re.exec(html);
      const bodyEnd = close === null ? html.length : close.index;
      const body = html.slice(end, bodyEnd);
      RE_TEXT_UNSAFE.lastIndex = 0;
      if (RE_TEXT_UNSAFE.test(body)) {
        out += html.slice(copied, end) + body.replace(RE_TEXT_UNSAFE, escapeChar);
        copied = bodyEnd;
      }
      RE_TAG.lastIndex = bodyEnd;
      continue;
    }
    RE_TAG.lastIndex = end;
    if (closing) {
      const at = names.lastIndexOf(name);
      if (at > 0) {
        names.length = at;
        kinds.length = at;
      }
      continue;
    }
    if (selfClosing) continue;
    const top = kinds[kinds.length - 1];
    if (name === "svg") {
      names.push(name);
      kinds.push("p");
    } else if (top === "f") {
      // An integration point only counts as one inside foreign content: `title`
      // in an HTML subtree is the HTML element.
      names.push(name);
      kinds.push("h");
    }
  }
  return copied === 0 ? html : out + html.slice(copied);
}
