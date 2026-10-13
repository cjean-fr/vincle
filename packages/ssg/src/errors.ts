/** Stable error family retained for existing consumers. */
export const ERR_SSG_BUILD = "ERR_VINCLE_SSG_BUILD";

/** Stable reasons allow tools to classify errors without parsing prose. */
export type SsgErrorReason =
  | "SOURCE_MISSING"
  | "SOURCE_NOT_DIRECTORY"
  | "SOURCE_READ_FAILED"
  | "SOURCE_FAILED"
  | "INVALID_CONFIG"
  | "INVALID_METADATA"
  | "INVALID_HANDLER"
  | "INVALID_ROUTE"
  | "INVALID_OUTPUT_PATH"
  | "INVALID_OUTPUT"
  | "OUTPUT_COLLISION"
  | "OUTPUT_FAILED"
  | "COPY_FAILED"
  | "COMPILATION_FAILED"
  | "LAYOUT_FAILED"
  | "PLUGIN_FAILED"
  | "ASSETS_FAILED"
  | "PREPARATION_FAILED"
  | "PUBLICATION_FAILED"
  | "BUILD_FAILED";

export interface SsgErrorDetails {
  reason: SsgErrorReason;
  /** Concrete corrective action, also included in the human-readable message. */
  hint: string;
  context?: Readonly<Record<string, string | number | boolean>>;
}

function causeDetails(cause: unknown, depth = 0): unknown {
  if (depth >= 5) return { message: "Further causes omitted." };
  if (cause instanceof SsgError) return cause.diagnostic(depth + 1);
  if (cause instanceof Error) {
    const code = "code" in cause ? String(cause.code) : undefined;
    return {
      name: cause.name,
      message: cause.message,
      ...(code ? { code } : {}),
      ...(cause.cause === undefined ? {} : { cause: causeDetails(cause.cause, depth + 1) }),
    };
  }
  return cause === undefined ? undefined : String(cause);
}

/** One diagnostic contract for humans, loggers and LLM tools. */
export class SsgError extends Error {
  readonly code = ERR_SSG_BUILD;
  readonly reason: SsgErrorReason;
  readonly summary: string;
  readonly hint: string;
  readonly context: Readonly<Record<string, string | number | boolean>>;

  constructor(summary: string, details: SsgErrorDetails, cause?: unknown) {
    const context = Object.freeze({ ...details.context });
    const values = Object.entries(context).map(
      ([key, value]) => `  ${key}: ${JSON.stringify(value)}`,
    );
    super(
      `[vincle/ssg] ${ERR_SSG_BUILD}/${details.reason}: ${summary}\n` +
        (values.length ? `Context:\n${values.join("\n")}\n` : "") +
        `Fix: ${details.hint}`,
      { cause },
    );
    this.name = "SsgError";
    this.reason = details.reason;
    this.summary = summary;
    this.hint = details.hint;
    this.context = context;
  }

  /** JSON.stringify(error) retains the diagnostic, unlike a plain Error. */
  toJSON(): Record<string, unknown> {
    return this.diagnostic();
  }

  /** @internal */
  diagnostic(depth = 0): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      reason: this.reason,
      message: this.message,
      summary: this.summary,
      hint: this.hint,
      context: this.context,
      ...(this.cause === undefined ? {} : { cause: causeDetails(this.cause, depth) }),
    };
  }
}

export function failure(summary: string, details: SsgErrorDetails, cause?: unknown): SsgError {
  return new SsgError(summary, details, cause);
}

/** Add operation context without losing a known error's classification or fix. */
export function contextualError(
  error: unknown,
  summary: string,
  details: SsgErrorDetails,
): SsgError {
  if (error instanceof SsgError) {
    return failure(
      `${summary}: ${error.summary}`,
      {
        reason: error.reason,
        hint: error.hint,
        context: { ...details.context, ...error.context },
      },
      error,
    );
  }
  return failure(
    `${summary}: ${error instanceof Error ? error.message : String(error)}`,
    details,
    error,
  );
}

export async function diagnose<T>(
  run: () => Promise<T>,
  summary: string,
  details: SsgErrorDetails,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw contextualError(error, summary, details);
  }
}
