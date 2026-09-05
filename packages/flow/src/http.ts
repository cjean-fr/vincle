import type { JSX } from "@vincle/core";

import type { FlowOptions, Negotiate, Negotiation, StreamingAdapter } from "./types.js";

import { renderToStream } from "./render.js";

export type { Negotiate, Negotiation } from "./types.js";

// `Vary` is a comma-separated list, so later sources must union their tokens
// into it rather than overwrite — otherwise a negotiator's `Vary: HX-Target`
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
 * Later sources win, so a negotiator can correct what the caller asked for —
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
 * Without it, the full page is rendered — the client library extracts its own
 * target. `mode: "fragment"` (shell suppressed) is an explicit opt-in; it only
 * produces output when the targeted content is expressed as `<Template>` fragments.
 */
export async function serve(
  req: Request,
  page: (negotiation: Negotiation) => JSX.Element,
  adapter: StreamingAdapter,
  opts?: FlowOptions &
    ResponseInit & {
      negotiate?: Negotiate;
      mode?: "full" | "fragment";
    },
): Promise<Response> {
  const negotiation = opts?.negotiate?.(req) ?? {};
  const body = renderToStream(() => page(negotiation), adapter, {
    ...opts,
    mode: opts?.mode ?? negotiation.mode,
  }).pipeThrough(new TextEncoderStream());
  const headers = mergeHeaders(
    { "content-type": "text/html; charset=utf-8" },
    opts?.headers,
    negotiation.headers,
  );
  return new Response(body, { ...opts, headers });
}

/**
 * HTMX negotiation: read `HX-Target`, and `Vary` on it so shared caches never
 * serve a fragment response to a full-page navigation.
 */
export function negotiateHtmx(req: Request): Negotiation {
  const target = req.headers.get("HX-Target") ?? undefined;
  return { headers: { Vary: "HX-Target" }, target };
}
