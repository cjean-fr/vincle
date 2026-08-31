import type { JSX, RawString } from "@vincle/core";

import type { AdapterCapabilities, MergeType } from "../types.js";

import { assertAdapter } from "../config.js";

type Child = JSX.Element | RawString | string | null;

/**
 * What `transformShell` sees of the flow state — not the full `FlowContext`.
 * A shell transform has exactly one legitimate reason to look at flow state:
 * deciding whether fragments are pending. The full context also carries
 * `assets`, `nextId`, and `registerTemplate`/the rest of `TemplateStore` —
 * mutation hooks a *shell transform* has no business reaching, so it isn't
 * handed the context that owns them.
 */
export interface ShellContext {
  /** Pending `<Template>`/`<Slot>` fragments, after the shell has rendered. */
  readonly templateStore: { readonly size: number };
}

export type Adapter = {
  Placeholder(props: { id: string; src: string | null; children: Child }): JSX.Element;
  Patch(props: { id: string; children: Child; merge: MergeType }): JSX.Element;
  Frame(props: { id: string; children: Child }): JSX.Element;
  capabilities: AdapterCapabilities;
  /**
   * Post-process the shell before it enters the stream. Receives a
   * `ShellContext`, so an adapter can decide based on the real fragment
   * count — e.g. inject a client runtime only when `ctx.templateStore.size >
   * 0` (fragments exist). Always called inside the flow scope, after the
   * shell node renders.
   */
  transformShell?(shell: string, ctx: ShellContext): string;
};

export const ALL_MERGES = ["replace", "append", "prepend", "before", "after"] as const;

const DEFAULT_CAPABILITIES: { streaming: true; merges: typeof ALL_MERGES } = {
  streaming: true,
  merges: ALL_MERGES,
};

type AdapterSpec<C extends AdapterCapabilities> = Omit<Adapter, "capabilities"> & {
  capabilities?: C;
};

export function createAdapter<const C extends AdapterCapabilities = typeof DEFAULT_CAPABILITIES>(
  spec: AdapterSpec<C>,
): Adapter & { capabilities: C } {
  const adapter: Adapter & { capabilities: C } = {
    ...spec,
    capabilities: spec.capabilities ?? (DEFAULT_CAPABILITIES as unknown as C),
  };
  // A mistyped adapter (a missing slot, a bad merge list) fails here, at
  // definition time — not when the first fragment tries to use it.
  assertAdapter(adapter, "createAdapter");
  return adapter;
}
