/**
 * The element around a template hole: what `jsxTemplate` knows that `jsxAttr`
 * does not.
 *
 * A precompile transform hands `jsxAttr` one attribute and no tag, and inlines
 * every static attribute into the template text, trusted as Deno does. So whether an
 * animation's `values` is judged as a URL is only answerable here: the tag and the static siblings are in the template's
 * own text, the dynamic siblings in its other holes.
 *
 * @module
 */

import { ElementAttr, serializeInElement } from "./attrs.js";

/** The start tag a hole sits in: its name, and the element-bound attributes around it. */
interface StartTag {
  readonly tag: string;
  /** Static attributes whose presence decides how the element is judged. */
  readonly staticAttrs: Readonly<Record<string, string>>;
  /** Every hole in attribute position in this start tag, this one included. */
  readonly holes: readonly number[];
}

// Parsed once per template and hole: a transform's template array is created
// once per call site and handed to every render, so identity is the cache key.
const START_TAGS = new WeakMap<object, (StartTag | null | undefined)[]>();

/**
 * Resolve `attr`, the attribute at `values[hole]`, against its element: the same rule
 * `buildAttrs` applies to a whole bag, from the tag and the siblings.
 *
 * A sibling still pending (`jsxAttr` on a promise) is awaited first: its name is
 * only known once it resolves, and it may be the `attributeName` that decides.
 * These are attribute values already in flight, not component calls, so awaiting
 * them together changes no execution order.
 *
 * A hole whose start tag cannot be read is judged as the worst element it could
 * be: an animation, so a value is URL-judged.
 */
export function renderElementAttr(
  attr: ElementAttr,
  templates: ArrayLike<string>,
  values: readonly unknown[],
  hole: number,
): string | Promise<string> {
  const start = startTagAround(templates, hole);
  if (start === null) {
    return serializeInElement(attr, "animate", {
      attributeName: undefined,
      values: undefined,
      [attr.name]: attr.raw,
    });
  }

  // `values[hole]` may still be the promise `attr` came from: it is set last.
  const element: Record<string, unknown> = { ...start.staticAttrs };
  let pending: Promise<unknown>[] | undefined;
  for (const j of start.holes) {
    const v = values[j];
    if (v instanceof ElementAttr) element[v.name] = v.raw;
    else if (v instanceof Promise) (pending ??= []).push(v);
  }
  if (pending === undefined) {
    element[attr.name] = attr.raw;
    return serializeInElement(attr, start.tag, element);
  }

  return Promise.all(pending).then((resolved) => {
    for (const v of resolved) if (v instanceof ElementAttr) element[v.name] = v.raw;
    element[attr.name] = attr.raw;
    return serializeInElement(attr, start.tag, element);
  });
}

function startTagAround(templates: ArrayLike<string>, hole: number): StartTag | null {
  if (typeof templates !== "object") return parseStartTag(templates, hole);
  let byHole = START_TAGS.get(templates);
  if (byHole === undefined) START_TAGS.set(templates, (byHole = []));
  let start = byHole[hole];
  if (start === undefined) byHole[hole] = start = parseStartTag(templates, hole);
  return start;
}

// Tokenizer states, the subset of the HTML spec's a transform's own output needs.
const BETWEEN = 0; // before an attribute name
const NAME = 1;
const AFTER_NAME = 2;
const BEFORE_VALUE = 3;
const QUOTED = 4;
const UNQUOTED = 5;

const isSpace = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

/**
 * Read the start tag `hole` sits in, from the template text alone.
 *
 * Its `<` is the last one before the hole: a transform escapes `<` in text and in
 * attribute values, and a hole in attribute position is never preceded by one of
 * its own. From there, the attributes are tokenized to the unquoted `>`, across
 * holes, since a sibling may follow the hole (`<animate values={x} attributeName="href">`).
 *
 * `null` when the hole is not an attribute of a start tag this can read.
 */
function parseStartTag(templates: ArrayLike<string>, hole: number): StartTag | null {
  let seg = hole;
  let pos = -1;
  for (; seg >= 0; seg--) {
    pos = (templates[seg] ?? "").lastIndexOf("<");
    if (pos !== -1) break;
  }
  if (pos === -1) return null;

  let text = templates[seg] ?? "";
  let i = pos + 1;
  const c0 = text.charCodeAt(i) | 32;
  if (c0 < 97 || c0 > 122) return null; // `</`, `<!`: not a start tag
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (isSpace(c) || c === 47 || c === 62) break;
    i++;
  }
  const tag = text.slice(pos + 1, i).toLowerCase();

  const staticAttrs: Record<string, string> = {};
  const holes: number[] = [];
  let state = BETWEEN;
  let name = "";
  let value = "";
  let quote = 0;
  const keep = (): void => {
    const lower = name.toLowerCase();
    if (
      lower === "attributename" ||
      lower === "values" ||
      lower === "to" ||
      lower === "from" ||
      lower === "by"
    ) {
      staticAttrs[name] = value;
    }
    name = "";
    value = "";
  };

  for (;;) {
    for (; i < text.length; i++) {
      const c = text.charCodeAt(i);
      switch (state) {
        case BETWEEN:
          if (c === 62) return holes.includes(hole) ? { tag, staticAttrs, holes } : null;
          if (!isSpace(c) && c !== 47) {
            state = NAME;
            name = text[i] ?? "";
          }
          break;
        case NAME:
        case AFTER_NAME:
          if (c === 61) state = BEFORE_VALUE;
          else if (c === 62) {
            keep();
            return holes.includes(hole) ? { tag, staticAttrs, holes } : null;
          } else if (isSpace(c)) state = AFTER_NAME;
          else if (c === 47) {
            keep();
            state = BETWEEN;
          } else if (state === AFTER_NAME) {
            keep();
            state = NAME;
            name = text[i] ?? "";
          } else name += text[i];
          break;
        case BEFORE_VALUE:
          if (c === 34 || c === 39) {
            state = QUOTED;
            quote = c;
          } else if (c === 62) {
            keep();
            return holes.includes(hole) ? { tag, staticAttrs, holes } : null;
          } else if (!isSpace(c)) {
            state = UNQUOTED;
            value = text[i] ?? "";
          }
          break;
        case QUOTED:
          if (c === quote) {
            keep();
            state = BETWEEN;
          } else value += text[i];
          break;
        case UNQUOTED:
          if (c === 62) {
            keep();
            return holes.includes(hole) ? { tag, staticAttrs, holes } : null;
          }
          if (isSpace(c)) {
            keep();
            state = BETWEEN;
          } else value += text[i];
          break;
      }
    }
    // The end of a static part: a hole follows, unless the template ends here.
    if (seg >= templates.length - 1) return null;
    if (state === NAME || state === AFTER_NAME) {
      keep();
      state = BETWEEN;
    }
    // A hole inside a value is part of that value, not an attribute of its own.
    if (state === BETWEEN) holes.push(seg);
    seg++;
    text = templates[seg] ?? "";
    i = 0;
  }
}
