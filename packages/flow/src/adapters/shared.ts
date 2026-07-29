import { raw, renderToString, type JSX, type RawString } from "@vincle/core";

import type { FlowContext } from "../context.js";
import type { AdapterCapabilities, FlowEvent, MergeType } from "../types.js";

type Child = JSX.Element | RawString | string | null;

export type Adapter = {
  Placeholder(props: { id: string; src: string | null; children: Child }): JSX.Element;
  Patch(props: { id: string; children: Child; merge: MergeType }): JSX.Element;
  Frame(props: { id: string; children: Child }): JSX.Element;
  capabilities: AdapterCapabilities;
  /**
   * Post-process the shell before it enters the stream. Receives the active
   * `FlowContext`, so an adapter can decide based on the real flow state — e.g.
   * inject a client runtime only when `ctx.templateStore.size > 0` (fragments
   * exist). Always called inside the flow scope, after the shell node renders.
   */
  transformShell?(shell: string, ctx: FlowContext): string;
  encode(): TransformStream<FlowEvent, string>;
};

function encodeWith(adapter: Pick<Adapter, "Patch">): TransformStream<FlowEvent, string> {
  // The shell arrives as a run of chunks, not one event. They are consecutive
  // slices of the same document, so nothing may be inserted between them — the
  // separator that used to follow "the shell event" is written once, when the
  // first non-shell event proves the run is over.
  let inShell = false;

  return new TransformStream<FlowEvent, string>({
    async transform(ev, c) {
      if (ev.type === "shell") {
        inShell = true;
        c.enqueue(ev.html);
        return;
      }
      // Ride the separator on the next write rather than enqueuing it alone, so
      // a single-chunk shell produces exactly the writes it always did.
      let prefix = "";
      if (inShell) {
        inShell = false;
        prefix = "\n";
      }
      if (ev.type === "fragment") {
        const wire = await renderToString(
          adapter.Patch({
            id: ev.id,
            children: raw(ev.html),
            merge: ev.merge,
          }),
        );
        c.enqueue(prefix + wire + "\n");
      } else {
        c.enqueue(prefix + ev.html + "\n");
      }
    },
    flush(c) {
      // Shell-only stream (no fragments, no closing tag): the separator still owes.
      if (inShell) c.enqueue("\n");
    },
  });
}

const ALL_MERGES = ["replace", "append", "prepend", "before", "after"] as const;

const DEFAULT_CAPABILITIES: { streaming: true; merges: typeof ALL_MERGES } = {
  streaming: true,
  merges: ALL_MERGES,
};

type AdapterSpec<C extends AdapterCapabilities> = Omit<Adapter, "encode" | "capabilities"> &
  Partial<Pick<Adapter, "encode">> & { capabilities?: C };

export function createAdapter<const C extends AdapterCapabilities = typeof DEFAULT_CAPABILITIES>(
  spec: AdapterSpec<C>,
): Adapter & { capabilities: C } {
  const encode = spec.encode ?? (() => encodeWith(adapter));
  const adapter: Adapter & { capabilities: C } = {
    ...spec,
    capabilities: spec.capabilities ?? (DEFAULT_CAPABILITIES as unknown as C),
    encode,
  };
  return adapter;
}
