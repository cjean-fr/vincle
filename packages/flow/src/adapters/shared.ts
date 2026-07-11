import type { FlowContext } from "../context.js";
import type { AdapterCapabilities, FlowEvent, MergeType } from "../types.js";
import { raw, renderToString, type VNode } from "@vincle/core";

export type Adapter = {
  Placeholder(props: {
    id: string;
    src: string | null;
    children: VNode;
  }): VNode;
  Patch(props: {
    id: string;
    children: VNode;
    merge: MergeType;
  }): VNode;
  Frame(props: { id: string; children: VNode }): VNode;
  capabilities: AdapterCapabilities;
  /**
   * Post-process the shell before it enters the stream. Receives the active
   * `FlowContext`, so an adapter can decide based on the real flow state — e.g.
   * inject a client runtime only when `ctx.pendingStore.size > 0` (fragments
   * exist). Always called inside the flow scope, after the shell node renders.
   */
  transformShell?(shell: string, ctx: FlowContext): string;
  encode(): TransformStream<FlowEvent, string>;
};

function encodeWith(
  adapter: Pick<Adapter, "Patch">,
): TransformStream<FlowEvent, string> {
  return new TransformStream<FlowEvent, string>({
    async transform(ev, c) {
      if (ev.type === "fragment") {
        const wire = await renderToString(
          adapter.Patch({ id: ev.id, children: raw(ev.html), merge: ev.merge }),
        );
        c.enqueue(wire + "\n");
      } else {
        c.enqueue(ev.html + "\n");
      }
    },
  });
}

const ALL_MERGES = ["replace", "append", "prepend", "before", "after"] as const;

const DEFAULT_CAPABILITIES: { streaming: true; merges: typeof ALL_MERGES } = {
  streaming: true,
  merges: ALL_MERGES,
};

type AdapterSpec<C extends AdapterCapabilities> = Omit<
  Adapter,
  "encode" | "capabilities"
> &
  Partial<Pick<Adapter, "encode">> & { capabilities?: C };

export function createAdapter<
  const C extends AdapterCapabilities = typeof DEFAULT_CAPABILITIES,
>(spec: AdapterSpec<C>): Adapter & { capabilities: C } {
  const encode = spec.encode ?? (() => encodeWith(adapter));
  const adapter: Adapter & { capabilities: C } = {
    ...spec,
    capabilities: spec.capabilities ?? (DEFAULT_CAPABILITIES as unknown as C),
    encode,
  };
  return adapter;
}
