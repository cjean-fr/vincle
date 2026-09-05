import type { JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";

// What the adapters imposed on the API: the five merge positions come from
// Turbo and HTMX, `capabilities` from what ESI refuses.
export const ALL_MERGES = ["replace", "append", "prepend", "before", "after"] as const;

/**
 * The list is the single declaration; the type derives from it. `assertAdapter`
 * validates against the same array, so the runtime check and the compile-time
 * type cannot drift apart, and `Record<MergeType, …>` in an adapter stops
 * compiling the moment the list changes.
 */
export type MergeType = (typeof ALL_MERGES)[number];

export interface AdapterCapabilities {
  streaming: boolean;
  merges: readonly MergeType[];
}

/**
 * Content that can be rendered as a template fragment.
 *
 * - `JSX.Element` — one-shot sync/async render
 * - `string` — **text**, escaped like any other child. It is stored verbatim
 *   and escaped when rendered, so `"<b>hi</b>"` reaches the page as visible
 *   `<b>hi</b>` characters, not as markup. For content that really is HTML —
 *   a cache entry, a CMS body — wrap it: `raw(html)` from `@vincle/core`.
 * - `(signal) => JSX.Element` — lazy factory; `signal` combines the request's
 *   own abort signal with the fragment's `timeout`, so a factory can forward
 *   it to its own async work (e.g. `fetch(url, { signal })`) to cancel that
 *   work early
 * - `AsyncIterable<JSX.Element>` — streaming (each yielded element is flushed)
 */
export type TemplateContent =
  | JSX.Element
  | string
  | ((signal: AbortSignal) => JSX.Element)
  | AsyncIterable<JSX.Element>
  | ((signal: AbortSignal) => AsyncIterable<JSX.Element>);

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
