import { ERR_FLOW_CONFIG, vincleError } from "./errors.js";
import { ALL_MERGES, type FlowOptions } from "./types.js";

export const PREFIX = "[vincle/flow]";

/**
 * Compact, unambiguous rendering of a value for error messages: strings are
 * quoted (so an empty string reads as `""`, not as nothing), errors name
 * themselves, and anything longer than a line is truncated.
 */
export function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value.length > 80 ? value.slice(0, 80) + "…" : value);
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "function") return `function ${value.name || "<anonymous>"}`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.length > 100 ? json.slice(0, 100) + "…" : json;
  } catch {
    return String(value);
  }
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    value instanceof AbortSignal ||
    (value != null &&
      typeof value === "object" &&
      typeof (value as AbortSignal).aborted === "boolean" &&
      typeof (value as AbortSignal).addEventListener === "function" &&
      typeof (value as AbortSignal).onabort === "object")
  );
}

/**
 * Validate the shared flow options at the call site, so a misconfigured value
 * fails at setup, before any bytes are rendered or streamed. The error
 * names the option, its invalid value, and the fix.
 *
 * `source` is the public API that received the options, for the message.
 * Extra keys (e.g. ResponseInit on `serve`) are ignored: only the flow keys
 * are ours to judge.
 */
export function assertFlowOptions(opts: FlowOptions | undefined, source: string): void {
  if (opts === undefined || opts === null) return;
  if (typeof opts !== "object") {
    throw vincleError(
      `${PREFIX} ${source}: options must be an object, got ${describeValue(opts)}. ` +
        "Example: { defaultTimeout: 5000, onError, signal }",
      ERR_FLOW_CONFIG,
    );
  }
  if (
    opts.defaultTimeout !== undefined &&
    (!Number.isFinite(opts.defaultTimeout) || opts.defaultTimeout < 0)
  ) {
    throw vincleError(
      `${PREFIX} ${source}: defaultTimeout must be a number of milliseconds >= 0, ` +
        `got ${describeValue(opts.defaultTimeout)}. Pass e.g. defaultTimeout: 5000, or omit it for no limit.`,
      ERR_FLOW_CONFIG,
    );
  }
  if (opts.onError !== undefined && typeof opts.onError !== "function") {
    throw vincleError(
      `${PREFIX} ${source}: onError must be a function (error, { id, kind }) => JSX.Element | void, ` +
        `got ${describeValue(opts.onError)}. Omit it to log errors to the console instead.`,
      ERR_FLOW_CONFIG,
    );
  }
  if (opts.signal !== undefined && !isAbortSignal(opts.signal)) {
    throw vincleError(
      `${PREFIX} ${source}: signal must be an AbortSignal, got ${describeValue(opts.signal)}. ` +
        "Example: const controller = new AbortController(); … { signal: controller.signal }",
      ERR_FLOW_CONFIG,
    );
  }
}

const ADAPTER_SLOTS = ["Placeholder", "Patch", "Frame"] as const;

/**
 * Structural validation of an adapter object. `undefined` is legal: static
 * mode may run without one. When an adapter is provided, it must implement
 * Placeholder, Patch, Frame, and a capabilities declaration.
 */
export function assertAdapter(adapter: unknown, source: string): void {
  if (adapter === undefined) return;
  if (adapter === null || typeof adapter !== "object") {
    throw vincleError(
      `${PREFIX} ${source}: adapter must be an adapter object, got ${describeValue(adapter)}. ` +
        "Use a built-in (TurboAdapter, NativeAdapter, HtmxAdapter, WebPlatformAdapter, EsiAdapter) or createAdapter().",
      ERR_FLOW_CONFIG,
    );
  }
  const record = adapter as Record<string, unknown>;
  const missing = ADAPTER_SLOTS.filter((slot) => typeof record[slot] !== "function");
  if (missing.length > 0) {
    throw vincleError(
      `${PREFIX} ${source}: the adapter is missing ${missing.map((slot) => `"${slot}"`).join(", ")}: ` +
        "an adapter needs Placeholder, Patch and Frame. Use createAdapter() or a built-in adapter.",
      ERR_FLOW_CONFIG,
    );
  }
  const caps = record["capabilities"] as { streaming?: unknown; merges?: unknown } | null;
  if (caps === null || typeof caps !== "object") {
    throw vincleError(
      `${PREFIX} ${source}: the adapter is missing capabilities: declare ` +
        "{ streaming: boolean, merges: MergeType[] } (see createAdapter()).",
      ERR_FLOW_CONFIG,
    );
  }
  if (typeof caps.streaming !== "boolean") {
    throw vincleError(
      `${PREFIX} ${source}: adapter.capabilities.streaming must be a boolean, ` +
        `got ${describeValue(caps.streaming)}.`,
      ERR_FLOW_CONFIG,
    );
  }
  const merges = caps.merges;
  const validMerges =
    Array.isArray(merges) &&
    merges.every(
      (merge) => typeof merge === "string" && (ALL_MERGES as readonly string[]).includes(merge),
    );
  if (!validMerges) {
    throw vincleError(
      `${PREFIX} ${source}: adapter.capabilities.merges must be an array of merge types ` +
        `(${ALL_MERGES.join(", ")}), got ${describeValue(merges)}.`,
      ERR_FLOW_CONFIG,
    );
  }
  if (record["transformShell"] !== undefined && typeof record["transformShell"] !== "function") {
    throw vincleError(
      `${PREFIX} ${source}: adapter.transformShell must be a function (shell, ctx) => string, ` +
        `got ${describeValue(record["transformShell"])}.`,
      ERR_FLOW_CONFIG,
    );
  }
}

/**
 * Validate a full flow config at the point of use. Every entry point funnels
 * through `initFlow`, so this is where a wrong config stops: at setup, not
 * mid-render.
 */
export function assertFlowConfig(config: unknown): void {
  if (config === null || typeof config !== "object") {
    throw vincleError(
      `${PREFIX} FlowConfig: the flow config must be an object, got ${describeValue(config)}. ` +
        'Example: { adapter: TurboAdapter, mode: "streaming" }',
      ERR_FLOW_CONFIG,
    );
  }
  // Read through `unknown`: a wrong value at runtime is exactly the case being
  // checked, and comparing `config.mode` directly would narrow the discriminated
  // union to `never` inside the error branch.
  const raw = config as Record<string, unknown>;
  const mode = raw["mode"];
  if (mode !== "streaming" && mode !== "static") {
    throw vincleError(
      `${PREFIX} FlowConfig.mode must be "streaming" or "static", got ${describeValue(mode)}.`,
      ERR_FLOW_CONFIG,
    );
  }
  const idPrefix = raw["idPrefix"];
  if (idPrefix !== undefined && typeof idPrefix !== "string") {
    throw vincleError(
      `${PREFIX} FlowConfig.idPrefix must be a string, got ${describeValue(idPrefix)}. ` +
        'Default: "fragment-".',
      ERR_FLOW_CONFIG,
    );
  }
  const generatePath = raw["generatePath"];
  if (generatePath !== undefined && typeof generatePath !== "function") {
    throw vincleError(
      `${PREFIX} FlowConfig.generatePath must be a function (id) => string, ` +
        `got ${describeValue(generatePath)}. Example: (id) => \`/fragments/\${id}.html\`.`,
      ERR_FLOW_CONFIG,
    );
  }
  if (mode === "static") {
    if (generatePath === undefined) {
      throw vincleError(
        `${PREFIX} FlowConfig: static mode requires generatePath: (id) => string. ` +
          "Example: generatePath: (id) => `/fragments/${id}.html`.",
        ERR_FLOW_CONFIG,
      );
    }
  } else if (generatePath !== undefined) {
    throw vincleError(
      `${PREFIX} FlowConfig: generatePath is only used in static mode (renderToStatic): ` +
        'remove it from the streaming config, or drop mode: "streaming" if you meant static generation.',
      ERR_FLOW_CONFIG,
    );
  }
  assertAdapter(raw["adapter"], "FlowConfig");
}

/** Validate a per-fragment timeout, at registration. */
export function assertTimeout(timeout: number | undefined, label: string): void {
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
    throw vincleError(
      `${PREFIX} ${label}: timeout must be a number of milliseconds >= 0, ` +
        `got ${describeValue(timeout)}. Pass e.g. timeout={5000}, or omit it to use defaultTimeout.`,
      ERR_FLOW_CONFIG,
    );
  }
}
