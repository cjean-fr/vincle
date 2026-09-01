import type { JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";

// These two types carry what the adapters imposed on the API: the five merge
// positions come from Turbo and HTMX, `capabilities` from what ESI refuses.
// Nothing tests this — shrinking either wouldn't fail a single test.
export type MergeType = "replace" | "append" | "prepend" | "before" | "after";

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
 *   (This line used to say "raw HTML", which was wrong in the direction that
 *   matters least for safety and most for use: the safe thing happened, and
 *   the documented use case silently did not.)
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
