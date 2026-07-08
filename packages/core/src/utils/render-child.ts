import {
  RawString,
  isDescriptor,
  type Awaitable,
  type VincleNode,
  type HTMLAttributes,
  type Component,
  type Descriptor,
} from "../core/types.js";
import { useContext } from "../core/context.js";
import { renderElement } from "./render-element.js";
import { escapeContent, escapeRawText } from "./escape.js";
import { ERROR_BOUNDARY_SYMBOL, boundaryStackCtx } from "../error-boundary.js";

// ── rawtext render helpers ────────────────────────────────────────────────

function renderArray(arr: unknown[], rawtextTag?: string): Awaitable<string> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item instanceof RawString) {
      out += item.value;
      continue;
    }
    if (typeof item === "string") {
      out += rawtextTag ? escapeRawText(item, rawtextTag) : escapeContent(item);
      continue;
    }
    if (typeof item === "number") {
      out += item;
      continue;
    }
    if (item == null || item === true || item === false) continue;

    const r = renderChild(item, rawtextTag);
    if (typeof r === "string") {
      out += r;
      continue;
    }

    const remaining = arr.length - i - 1;
    const tail = new Array<Awaitable<string>>(remaining + 1);
    tail[0] = r;
    for (let j = 0; j < remaining; j++) {
      tail[j + 1] = renderChild(arr[i + 1 + j], rawtextTag);
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
  rawtextTag?: string,
): Promise<string> {
  let out = "";
  for await (const item of iterable) out += await renderChild(item, rawtextTag);
  return out;
}

// ── public helpers ────────────────────────────────────────────────────────

export function renderChild(
  value: unknown,
  rawtextTag?: string,
): Awaitable<string> {
  if (value == null || value === true || value === false) return "";
  if (typeof value === "string")
    return rawtextTag ? escapeRawText(value, rawtextTag) : escapeContent(value);
  if (typeof value === "number") return String(value);

  if (value instanceof Promise)
    return value.then((v) => renderChild(v, rawtextTag));

  if (value instanceof RawString) return value.value;
  if (Array.isArray(value)) return renderArray(value, rawtextTag);
  if (typeof (value as any)[Symbol.iterator] === "function")
    return renderChild(Array.from(value as Iterable<unknown>), rawtextTag);
  if (typeof (value as any)[Symbol.asyncIterator] === "function")
    return renderAsyncIterable(value as AsyncIterable<unknown>, rawtextTag);

  if (isDescriptor(value)) return renderDescriptor(value);

  return rawtextTag
    ? escapeRawText(String(value), rawtextTag)
    : escapeContent(String(value));
}

// ── error annotation (private) ────────────────────────────────────────────

const ANNOTATED_ERROR = Symbol("annotated");

function componentName(tag: Component<any>, error?: unknown): string {
  if ((tag as any).displayName) return (tag as any).displayName;
  const n = tag.name;
  if (n) return n;

  if (error instanceof Error && typeof error.stack === "string") {
    for (const line of error.stack.split("\n")) {
      const m = line.trim().match(/^at\s+(?:async\s+)?(\S+)/);
      if (m && m[1] && m[1] !== "async" && m[1] !== "<anonymous>") return m[1];
    }
  }

  return "<anonymous>";
}

function annotateError(error: unknown, tag: Component<any>): unknown {
  const name = componentName(tag, error);
  if (error instanceof Error) {
    if (!(ANNOTATED_ERROR in error)) {
      error.message = `[${name}] ${error.message}`;
      Object.defineProperty(error, ANNOTATED_ERROR, { value: true });
    }
    return error;
  }
  const annotated = new Error(`[${name}] ${String(error)}`);
  Object.defineProperty(annotated, ANNOTATED_ERROR, { value: true });
  return annotated;
}

// ── descriptor renderer ───────────────────────────────────────────────────

export function renderDescriptor(desc: Descriptor): Awaitable<string> {
  if (typeof desc.type === "string") {
    const result = renderElement(
      desc.type,
      desc.props as HTMLAttributes,
      desc.props["children"] as VincleNode,
    );
    if (result instanceof RawString) return result.value;
    return result.then((r) => r.value);
  }

  if (typeof desc.type === "function") {
    if (ERROR_BOUNDARY_SYMBOL in desc.type) {
      return renderBoundary(desc);
    }
    return renderComponent(desc);
  }

  return renderChild(desc.type);
}

async function renderComponent(desc: Descriptor): Promise<string> {
  const component = desc.type as Component<any>;
  try {
    const result = await component(desc.props);
    return await renderChild(result);
  } catch (e) {
    throw annotateError(e, component);
  }
}

async function renderBoundary(desc: Descriptor): Promise<string> {
  const stack = useContext(boundaryStackCtx);
  const fallback = (desc.props as any).fallback;
  stack.push({ fallback });

  try {
    return await renderChild((desc.props as any).children);
  } catch (e) {
    console.error("[vincle/core] ErrorBoundary caught:", e);
    const boundary = stack[stack.length - 1]!;
    const fallbackContent =
      typeof boundary.fallback === "function"
        ? (boundary.fallback as (e: unknown) => VincleNode)(e)
        : (boundary.fallback as VincleNode);
    return await renderChild(fallbackContent);
  } finally {
    stack.pop();
  }
}
