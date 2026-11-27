import type { JSX } from "@vincle/core";

import type { FlowOptions, Negotiate, Negotiation, RenderMode, StreamingAdapter } from "./types.js";

import { renderToEventStream, renderToStream } from "./render.js";

export type { Negotiate, Negotiation } from "./types.js";

// `Vary` is a comma-separated list, so later sources must union their tokens
// into it rather than overwrite: otherwise a negotiator's `Vary: HX-Target`
// would silently drop a caller's `Vary: Cookie`, corrupting shared-cache keys.
function appendVary(headers: Headers, value: string): void {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const add = (list: string | null) => {
    if (!list) return;
    for (const raw of list.split(",")) {
      const tok = raw.trim();
      const key = tok.toLowerCase();
      if (tok && !seen.has(key)) {
        seen.add(key);
        tokens.push(tok);
      }
    }
  };
  add(headers.get("vary"));
  add(value);
  headers.set("vary", tokens.join(", "));
}

/**
 * Later sources win, so a negotiator can correct what the caller asked for,
 * except `Vary`, which unions rather than overwrites.
 */
function mergeHeaders(
  defaults?: HeadersInit,
  fromOptions?: HeadersInit,
  fromNegotiation?: HeadersInit,
): Headers {
  const headers = new Headers(defaults);
  for (const source of [fromOptions, fromNegotiation]) {
    for (const [k, v] of new Headers(source ?? {})) {
      if (k === "vary") appendVary(headers, v);
      else headers.set(k, v);
    }
  }
  return headers;
}

/**
 * Create a `Response` from a page component and an adapter.
 *
 * Negotiation is opt-in and orthogonal to the adapter: pass `negotiate` (e.g.
 * `negotiateHtmx`, or your own) to extract per-request hints and headers.
 * Without it, the full page is rendered: the client library extracts its own
 * target. `mode: "fragment"` (shell suppressed) is an explicit opt-in; it only
 * produces output when the targeted content is expressed as `<Defer>` fragments.
 */
export async function serve(
  req: Request,
  page: (negotiation: Negotiation) => JSX.Element,
  adapter: StreamingAdapter,
  opts?: FlowOptions &
    ResponseInit & {
      negotiate?: Negotiate;
      mode?: RenderMode;
      /** `"sse"` answers with `text/event-stream`, the framing `streamInto` reads. Overrides the negotiation. */
      transport?: "html" | "sse";
    },
): Promise<Response> {
  const negotiation = opts?.negotiate?.(req) ?? {};
  const sse = (opts?.transport ?? negotiation.transport) === "sse";
  const body = (sse ? renderToEventStream : renderToStream)(() => page(negotiation), adapter, {
    ...opts,
    signal: opts?.signal ? AbortSignal.any([req.signal, opts.signal]) : req.signal,
    mode: opts?.mode ?? negotiation.mode,
  }).pipeThrough(new TextEncoderStream());
  const headers = mergeHeaders(
    sse
      ? { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" }
      : { "content-type": "text/html; charset=utf-8" },
    opts?.headers,
    negotiation.headers,
  );
  return new Response(body, { ...opts, headers });
}

/**
 * Negotiation for a page that loads pieces of itself with `fetch` and `streamInto`:
 * a request that asks for `text/event-stream` in `Accept` is answered with a
 * partial render framed as events (`mode: "partial"`, `transport: "sse"`); any
 * other request, a navigation included, gets the page. `Vary: Accept` keeps shared
 * caches from mixing the two.
 *
 * It reads `Accept` and not the `Sec-Fetch-*` headers on purpose: `fetch`, XHR,
 * htmx and Turbo all send `Sec-Fetch-Dest: empty`, so those headers tell a
 * navigation from a script, not one script from another, and a browser sends
 * them only to secure origins. The client names what it wants:
 * `fetch(url, { headers: { Accept: "text/event-stream" } })`.
 */
export function negotiateFetch(req: Request): Negotiation {
  const headers = { Vary: "Accept" };
  return (req.headers.get("Accept") ?? "").toLowerCase().includes("text/event-stream")
    ? { headers, mode: "partial", transport: "sse" }
    : { headers };
}

/**
 * HTMX negotiation: read `HX-Target`, and `Vary` on it so shared caches never
 * serve a fragment response to a full-page navigation.
 *
 * htmx applies an ordinary response only once it is complete, so a response
 * that streams `<Defer>` fragments would show nothing until the last one. When
 * the request comes from htmx with its `sse` extension (it adds
 * `text/event-stream` to `Accept`), the answer is an event stream instead,
 * which that extension swaps in event by event. `Vary` then includes `Accept`.
 */
export function negotiateHtmx(req: Request): Negotiation {
  const target = req.headers.get("HX-Target") ?? undefined;
  const sse =
    req.headers.has("HX-Request") &&
    (req.headers.get("Accept") ?? "").toLowerCase().includes("text/event-stream");
  return sse
    ? { headers: { Vary: "HX-Target, Accept" }, target, transport: "sse" }
    : { headers: { Vary: "HX-Target" }, target };
}
