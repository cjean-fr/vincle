import type { Awaitable, JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";

// Merge positions from Turbo/HTMX, plus `morph` (a *how*, not a *where*). An adapter
// with no diffing client rejects `morph` rather than falling back to a plain replace.
export const ALL_MERGES = ["replace", "append", "prepend", "before", "after", "morph"] as const;

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

export interface FlowOptions {
  signal?: AbortSignal;
  onError?: OnError;
  defaultTimeout?: number;
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

export interface Negotiation {
  headers?: HeadersInit;
  mode?: "full" | "fragment";
  target?: string;
}

export type Negotiate = (req: Request) => Negotiation;

export type StreamingAdapter = Adapter & {
  capabilities: { streaming: true };
};
