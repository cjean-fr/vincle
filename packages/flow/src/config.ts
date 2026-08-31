import { ALL_MERGES } from "./adapters/shared.js";

import type { FlowOptions } from "./types.js";

export const PREFIX = "[vincle/flow]";

/**
 * Compact, unambiguous rendering of a value for error messages: strings are
 * quoted (so an empty string reads as `""`, not as nothing), errors name
 * themselves, and anything longer than a line is truncated.
 */
export function describeValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    return JSON.stringify(v.length > 80 ? v.slice(0, 80) + "…" : v);
  }
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") return String(v);
  if (typeof v === "function") return `function ${v.name || "<anonymous>"}`;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return String(v);
    return s.length > 100 ? s.slice(0, 100) + "…" : s;
  } catch {
    return String(v);
  }
}

function isAbortSignal(v: unknown): v is AbortSignal {
  return (
    v instanceof AbortSignal ||
    (v != null &&
      typeof v === "object" &&
      typeof (v as AbortSignal).aborted === "boolean" &&
      typeof (v as AbortSignal).addEventListener === "function" &&
      typeof (v as AbortSignal).onabort === "object")
  );
}

/**
 * Validate the shared flow options at the call site, so a misconfigured value
 * fails at setup — before a single byte is rendered or streamed — with a
 * message that names the option, the offending value, and the fix.
 *
 * `source` is the public API that received the options, for the message.
 * Extra keys (e.g. ResponseInit on `serve`) are ignored: only the flow keys
 * are ours to judge.
 */
export function assertFlowOptions(opts: FlowOptions | undefined, source: string): void {
  if (opts === undefined || opts === null) return;
  if (typeof opts !== "object") {
    throw new Error(
      `${PREFIX} ${source}: options must be an object, got ${describeValue(opts)}. ` +
        "Example: { defaultTimeout: 5000, onError, signal }",
    );
  }
  if (
    opts.defaultTimeout !== undefined &&
    (!Number.isFinite(opts.defaultTimeout) || opts.defaultTimeout < 0)
  ) {
    throw new Error(
      `${PREFIX} ${source}: defaultTimeout must be a number of milliseconds >= 0, ` +
        `got ${describeValue(opts.defaultTimeout)}. Pass e.g. defaultTimeout: 5000, or omit it for no limit.`,
    );
  }
  if (opts.onError !== undefined && typeof opts.onError !== "function") {
    throw new Error(
      `${PREFIX} ${source}: onError must be a function (error, { id, kind }) => JSX.Element | void, ` +
        `got ${describeValue(opts.onError)}. Omit it to log errors to the console instead.`,
    );
  }
  if (opts.signal !== undefined && !isAbortSignal(opts.signal)) {
    throw new Error(
      `${PREFIX} ${source}: signal must be an AbortSignal, got ${describeValue(opts.signal)}. ` +
        "Example: const controller = new AbortController(); … { signal: controller.signal }",
    );
  }
}

const ADAPTER_SLOTS = ["Placeholder", "Patch", "Frame"] as const;

/**
 * Structural validation of an adapter object. `undefined` is legal — static
 * mode may run without one — a non-undefined adapter must be complete:
 * Placeholder, Patch, Frame, and a capabilities declaration.
 */
export function assertAdapter(adapter: unknown, source: string): void {
  if (adapter === undefined) return;
  if (adapter === null || typeof adapter !== "object") {
    throw new Error(
      `${PREFIX} ${source}: adapter must be an adapter object, got ${describeValue(adapter)}. ` +
        "Use a built-in (TurboAdapter, NativeAdapter, HtmxAdapter, WebPlatformAdapter, EsiAdapter) or createAdapter().",
    );
  }
  const record = adapter as Record<string, unknown>;
  const missing = ADAPTER_SLOTS.filter((slot) => typeof record[slot] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `${PREFIX} ${source}: the adapter is missing ${missing.map((m) => `"${m}"`).join(", ")} — ` +
        "an adapter needs Placeholder, Patch and Frame. Use createAdapter() or a built-in adapter.",
    );
  }
  const caps = record["capabilities"] as { streaming?: unknown; merges?: unknown } | null;
  if (caps === null || typeof caps !== "object") {
    throw new Error(
      `${PREFIX} ${source}: the adapter is missing capabilities — declare ` +
        "{ streaming: boolean, merges: MergeType[] } (see createAdapter()).",
    );
  }
  if (typeof caps.streaming !== "boolean") {
    throw new Error(
      `${PREFIX} ${source}: adapter.capabilities.streaming must be a boolean, ` +
        `got ${describeValue(caps.streaming)}.`,
    );
  }
  const merges = caps.merges;
  const validMerges =
    Array.isArray(merges) &&
    merges.every((m) => typeof m === "string" && (ALL_MERGES as readonly string[]).includes(m));
  if (!validMerges) {
    throw new Error(
      `${PREFIX} ${source}: adapter.capabilities.merges must be an array of merge types ` +
        `(${ALL_MERGES.join(", ")}), got ${describeValue(merges)}.`,
    );
  }
  if (record["transformShell"] !== undefined && typeof record["transformShell"] !== "function") {
    throw new Error(
      `${PREFIX} ${source}: adapter.transformShell must be a function (shell, ctx) => string, ` +
        `got ${describeValue(record["transformShell"])}.`,
    );
  }
}

/**
 * Validate a full flow config at the point of use. Every entry point funnels
 * through `initFlow`, so this is where a wrong config stops — at setup, not
 * mid-render.
 */
export function assertFlowConfig(config: unknown): void {
  if (config === null || typeof config !== "object") {
    throw new Error(
      `${PREFIX} FlowConfig: the flow config must be an object, got ${describeValue(config)}. ` +
        'Example: { adapter: TurboAdapter, mode: "streaming" }',
    );
  }
  // Read through `unknown`: a wrong value at runtime is exactly the case being
  // checked, and comparing `config.mode` directly would narrow the discriminated
  // union to `never` inside the error branch.
  const raw = config as Record<string, unknown>;
  const mode = raw["mode"];
  if (mode !== "streaming" && mode !== "static") {
    throw new Error(
      `${PREFIX} FlowConfig.mode must be "streaming" or "static", got ${describeValue(mode)}.`,
    );
  }
  const idPrefix = raw["idPrefix"];
  if (idPrefix !== undefined && typeof idPrefix !== "string") {
    throw new Error(
      `${PREFIX} FlowConfig.idPrefix must be a string, got ${describeValue(idPrefix)}. ` +
        'Default: "fragment-".',
    );
  }
  const generatePath = raw["generatePath"];
  if (generatePath !== undefined && typeof generatePath !== "function") {
    throw new Error(
      `${PREFIX} FlowConfig.generatePath must be a function (id) => string, ` +
        `got ${describeValue(generatePath)}. Example: (id) => \`/fragments/\${id}.html\`.`,
    );
  }
  if (mode === "static") {
    if (generatePath === undefined) {
      throw new Error(
        `${PREFIX} FlowConfig: static mode requires generatePath: (id) => string. ` +
          "Example: generatePath: (id) => `/fragments/${id}.html`.",
      );
    }
  } else if (generatePath !== undefined) {
    throw new Error(
      `${PREFIX} FlowConfig: generatePath is only used in static mode (renderToStatic) — ` +
        'remove it from the streaming config, or drop mode: "streaming" if you meant static generation.',
    );
  }
  assertAdapter(raw["adapter"], "FlowConfig");
}

/** Validate a per-fragment timeout, at registration. */
export function assertTimeout(timeout: number | undefined, label: string): void {
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
    throw new Error(
      `${PREFIX} ${label}: timeout must be a number of milliseconds >= 0, ` +
        `got ${describeValue(timeout)}. Pass e.g. timeout={5000}, or omit it to use defaultTimeout.`,
    );
  }
}