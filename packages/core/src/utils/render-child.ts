import { RawString, type Awaitable } from "../core/types.js";
import { escapeContent, escapeRawText } from "./escape.js";

// `parentTag` is set (to the enclosing element's tag) only when that element is
// a RAWTEXT element — `renderElement` is the sole producer and it validates the
// tag first. So a defined `parentTag` always means "escape as rawtext", and the
// common case (`undefined`) short-circuits before any Set lookup. Called only on
// the string branch, so number/boolean/null/Promise/array children pay nothing.
function escapeFor(str: string, parentTag: string | undefined): string {
  return parentTag !== undefined
    ? escapeRawText(str, parentTag)
    : escapeContent(str);
}

function renderArray(arr: unknown[], parentTag?: string): Awaitable<string> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item instanceof RawString) {
      out += item.value;
      continue;
    }
    if (typeof item === "string") {
      out += escapeFor(item, parentTag);
      continue;
    }
    if (typeof item === "number") {
      out += item;
      continue;
    }
    if (item == null || item === true || item === false) continue;

    const r = renderChild(item, parentTag);
    if (typeof r === "string") {
      out += r;
      continue;
    }

    const remaining = arr.length - i - 1;
    const tail = new Array<Awaitable<string>>(remaining + 1);
    tail[0] = r;
    for (let j = 0; j < remaining; j++) {
      tail[j + 1] = renderChild(arr[i + 1 + j], parentTag);
    }
    return Promise.all(tail).then((parts) => {
      let result = out;
      for (let k = 0; k < parts.length; k++) result += parts[k];
      return result;
    });
  }
  return out;
}

async function renderAsyncIterable(
  iterable: AsyncIterable<unknown>,
  parentTag?: string,
): Promise<string> {
  let out = "";
  for await (const item of iterable) out += await renderChild(item, parentTag);
  return out;
}

export function renderChild(
  value: unknown,
  parentTag?: string,
): Awaitable<string> {
  if (value == null || value === true || value === false) return "";
  if (typeof value === "string") return escapeFor(value, parentTag);
  if (typeof value === "number") return String(value);

  if (value instanceof Promise)
    return value.then((v) => renderChild(v, parentTag));

  if (value instanceof RawString) return value.value;
  if (Array.isArray(value)) return renderArray(value, parentTag);
  if (typeof (value as any)[Symbol.iterator] === "function")
    return renderChild(Array.from(value as Iterable<unknown>), parentTag);
  if (typeof (value as any)[Symbol.asyncIterator] === "function")
    return renderAsyncIterable(value as AsyncIterable<unknown>, parentTag);

  return escapeFor(String(value), parentTag);
}
