import type MagicString from "magic-string";

export interface PluginConfig {
  runtimeSource?: string;
}

/**
 * A runtime's `jsxAttr`, as it arrives: the shape is the runtime's to choose,
 * not ours. `@vincle/core` returns a `RawString` (`{ value }`) to mark
 * already-escaped HTML; Deno's and Preact's return a plain string. The `Promise`
 * arm exists because the type is the general one: for the static string and
 * boolean values this transform passes, every known runtime answers
 * synchronously.
 *
 * `normalizeRuntimeHelpers` reduces all of it to text, once, at the entry point.
 */
export type RenderAttr = (
  name: string,
  value: unknown,
) => string | { value: string } | Promise<string | { value: string }>;

/** A runtime's `jsxEscape`, as it arrives. Same shapes as {@link RenderAttr}. */
export type RenderEscape = (
  value: unknown,
) => string | { value: string } | Promise<string | { value: string }>;

/**
 * What the transform needs of a runtime, once the entry point has normalized
 * it: text in, text out, synchronous. `attr` returns `""` for an attribute the
 * runtime drops.
 *
 * The whole point is that no emit helper below ever asks what shape a foreign
 * runtime answered in: a question that, asked in the middle of the attribute
 * path, is asked about a value on its way into a start tag.
 */
export interface RuntimeHelpers {
  jsxAttr: (name: string, value: string | true) => string;
  jsxEscape: (text: string) => string;
}

export interface TransformResult {
  code: string;
  map?: ReturnType<MagicString["generateMap"]>;
}

/**
 * Per-file transform state shared by every emit helper.
 *
 * `source` is the original module text (used for span slicing); `used`
 * accumulates the set of runtime helpers the rewritten code references so the
 * matching import can be injected once at the end.
 */
export interface TransformContext {
  source: string;
  used: Set<string>;
  /**
   * The target runtime's own helpers, normalized at the entry point,
   * `null` in compatibility mode. Everything below this line sees text in, text
   * out; the shapes a foreign runtime may return are the entry point's problem.
   */
  helpers: RuntimeHelpers | null;
  /**
   * Reproduce Deno's precompile output, defects included: true whenever no
   * serializer was injected.
   *
   * There is no option behind this. A serializer arrives only for a runtime
   * that declares the `"vincle"` precompile dialect, which is the runtime that
   * promises a precompiled page renders the same bytes as a dynamic one. That
   * promise is what makes it safe to correct the reference transform; without
   * it, correcting anything would mean guessing how the target runtime
   * serializes, so the reference output is what gets emitted.
   */
  compatibility: boolean;
}

/** Minimal structural view of an oxc AST node for generic traversal. */
export interface AnyNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface Replacement {
  start: number;
  end: number;
  text: string;
}
