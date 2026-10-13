import type { SsgOutput, SsgOutputs, SsgProducer, PageContext } from "./types.js";

import { failure } from "./errors.js";

export async function* iterateOutputs(value: SsgOutputs): AsyncGenerator<SsgOutput> {
  if (value && typeof value === "object" && "path" in value) yield value as SsgOutput;
  else if (
    value &&
    (typeof value === "object" || typeof value === "function") &&
    (Symbol.iterator in value || Symbol.asyncIterator in value)
  )
    yield* value;
  else
    throw failure("A handler must return an output or an iterable of outputs.", {
      reason: "INVALID_OUTPUT",
      hint: "Return { path, content }, an array of such objects, or a synchronous/asynchronous iterable of outputs.",
      context: { received: value === null ? "null" : typeof value },
    });
}

/** Modules can add outputs alongside their default component/content. */
export function withAdditionalOutputs(
  mod: Record<string, unknown>,
  render: SsgProducer,
): SsgProducer {
  const extra = mod["outputs"];
  if (extra === undefined) return render;
  return async function* (context: PageContext) {
    yield* iterateOutputs(await render(context));
    const additional = typeof extra === "function" ? await extra(context) : extra;
    yield* iterateOutputs(additional as SsgOutputs);
  };
}
