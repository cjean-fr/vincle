import { renderToString } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";

export type AssetType = "style" | "script";

export type AssetContent = string | (() => string | Promise<string>);

export type AssetEntry = {
  type: AssetType;
  content: AssetContent;
  attrs: Record<string, string>;
};

export type AssetState = {
  entries: Map<string, AssetEntry>;
  emitted: Set<string>;
};

export function createAssetState(): AssetState {
  return { entries: new Map(), emitted: new Set() };
}

const REGEX_MARKER = /<!-- vincle:(style|script):(.+?) -->/g;

export function createMarker(type: AssetType, name: string): string {
  return `<!-- vincle:${type}:${name} -->`;
}

export function registerAsset(
  state: AssetState,
  name: string,
  entry: AssetEntry,
): void {
  if (state.entries.has(name)) {
    if (process.env.NODE_ENV !== "production") {
      const existing = state.entries.get(name)!;
      if (
        existing.type !== entry.type ||
        JSON.stringify(existing.attrs) !== JSON.stringify(entry.attrs)
      ) {
        console.warn(
          `[vincle/flow] Asset "${name}" is declared multiple times with different attributes. The first declaration wins.`,
        );
      }
    }
    return;
  }
  state.entries.set(name, entry);
}

function isHtmlCommentSafe(name: string): boolean {
  return !name.includes("-->") && !name.includes("<!--");
}

function assertNameSafe(name: string): void {
  if (!isHtmlCommentSafe(name)) {
    throw new Error(
      `Asset name "${name}" is not safe for use in HTML comment markers`,
    );
  }
}

function markEmitted(state: AssetState, name: string): boolean {
  if (state.emitted.has(name)) return false;
  state.emitted.add(name);
  return true;
}

async function evaluateAndBuildTag(
  type: AssetType,
  name: string,
  entry: AssetEntry,
): Promise<string> {
  let content: string;
  try {
    content =
      typeof entry.content === "function"
        ? await (entry.content as () => string | Promise<string>)()
        : entry.content;
  } catch (error) {
    console.error(`[vincle/flow] Error evaluating asset "${name}":`, error);
    throw error;
  }
  const tag = type === "style" ? "style" : "script";
  return renderToString(
    jsx(tag, { "data-name": name, ...entry.attrs, children: content }),
  );
}

export async function resolveAssets(
  html: string,
  state?: AssetState | { isolate: boolean },
): Promise<string> {
  const resolved: AssetState =
    state && "entries" in state ? state : createAssetState();

  REGEX_MARKER.lastIndex = 0;

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = REGEX_MARKER.exec(html)) !== null) {
    const [fullMatch, type, rawName] = match;
    const name = rawName!.trim();

    result += html.slice(lastIndex, match.index);

    if (!markEmitted(resolved, name)) {
      lastIndex = match.index + fullMatch.length;
      continue;
    }

    const entry = resolved.entries.get(name);

    if (entry && entry.type === type) {
      result += await evaluateAndBuildTag(type, name, entry);
    }

    lastIndex = match.index + fullMatch.length;
  }

  result += html.slice(lastIndex);
  return result;
}

export { assertNameSafe };
