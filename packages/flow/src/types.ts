import type { Awaitable, JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";

// Merge positions from Turbo/HTMX, plus `morph` (a *how*, not a *where*). An adapter
// with no diffing client rejects `morph` rather than falling back to a plain replace.
// `update` is Turbo-specific: it replaces the target's content (not the element itself).
export const ALL_MERGES = [
  "replace",
  "update",
  "append",
  "prepend",
  "before",
  "after",
  "morph",
] as const;

/** Derived from `ALL_MERGES`, the single declaration `assertAdapter` also validates: runtime and type can't drift. */
export type MergeType = (typeof ALL_MERGES)[number];

export interface AdapterCapabilities {
  streaming: boolean;
  merges: readonly MergeType[];
}

/**
 * Content renderable as a deferred fragment:
 * - `JSX.Element | string`: one-shot sync/async render; strings are escaped
 *   text. For real HTML, wrap with `raw()`.
 * - `(signal) => JSX.Element | string`: lazy factory; `signal` = request abort + fragment timeout
 * - `AsyncIterable<JSX.Element | string>`: streaming; each string is escaped
 */
type DeferValue = Awaitable<JSX.Element> | string;
type DeferStream = AsyncIterable<JSX.Element | string>;

export type DeferContent =
  | DeferValue
  | ((signal: AbortSignal) => DeferValue | DeferStream)
  | DeferStream
  | ((signal: AbortSignal) => DeferStream);

export interface Shell {
  type: "shell";
  html: string;
}

export interface Fragment {
  type: "fragment";
  id: string;
  html: string;
  merge: MergeType;
}

export type FlowEvent = Shell | Fragment | { type: "close"; html: string };

export type FlowErrorInfo = { id: string; kind: "fragment" | "stream" };

export type OnError = (error: unknown, info: FlowErrorInfo) => JSX.Element | void;

export interface FlowObservation {
  id: string;
  phase: "start" | "complete" | "error" | "timeout" | "cancel";
  durationMs: number;
  error?: unknown;
}

export interface FlowOptions {
  /** Maximum active fragments, including live streams. Omit for unlimited concurrency. */
  maxConcurrency?: number;
  /** Diagnostic callback. Exceptions are ignored so instrumentation cannot break rendering. */
  onObserve?: (event: FlowObservation) => void;
  signal?: AbortSignal;
  onError?: OnError;
  /** Render deadline in ms; error fallbacks receive a fresh deadline of the same duration. */
  defaultTimeout?: number;
  /**
   * Prefix of the generated fragment ids (default `"fragment-"`). Give a response that patches
   * a page already carrying ids from its own render (a fragment fetched by htmx, say) a prefix
   * of its own, so its ids cannot collide with the page's.
   */
  idPrefix?: string;
}

export type FlowConfig =
  | {
      adapter: Adapter;
      mode: "streaming";
      generatePath?: never;
      idPrefix?: string;
    }
  | {
      adapter?: Adapter;
      mode: "static";
      generatePath: (id: string) => string;
      idPrefix?: string;
    };

/**
 * What a render emits. `"full"`: the page, its fragments' placeholders, the
 * patches. `"fragment"`: the patches only (the shell is rendered to register the
 * fragments but never sent). `"partial"`: the content with its placeholders and
 * the patches, as a piece to insert into a page that already has its client
 * runtime: no document-level additions (the Native polyfill) and no closing tags.
 */
export type RenderMode = "full" | "fragment" | "partial";

export interface Negotiation {
  headers?: HeadersInit;
  mode?: RenderMode;
  target?: string;
  /**
   * `"sse"` answers with `text/event-stream`: one event for the shell, then one
   * per patch. Default `"html"`.
   */
  transport?: "html" | "sse";
}

export type Negotiate = (req: Request) => Negotiation;

export type StreamingAdapter = Adapter & {
  capabilities: { streaming: true };
};
