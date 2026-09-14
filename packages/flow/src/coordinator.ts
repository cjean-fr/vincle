import type { TemplateStore } from "./template-store.js";
import type { DeferGroupData, DeferItem, FlowEvent } from "./types.js";

type Emit = (ev: FlowEvent) => Promise<void>;

interface FragmentState {
  id: string;
  status: "pending" | "ready" | "settled";
  events: FlowEvent[];
  settled: boolean;
  waitTurnPromise?: Promise<void>;
  waitTurnResolve?: () => void;
  streamRevealed?: boolean;
}

interface GroupState {
  group: DeferGroupData;
  frontierIndex: number;
  flushed: boolean;
}

export class DeferCoordinator {
  private store: TemplateStore;
  private realEmit: Emit;
  private emitTail = Promise.resolve();

  private fragmentStates = new Map<string, FragmentState>();
  private groupStates = new Map<string, GroupState>();

  constructor(store: TemplateStore, realEmit: Emit) {
    this.store = store;
    this.realEmit = realEmit;
  }

  private safeEmit(ev: FlowEvent): Promise<void> {
    const next = this.emitTail.then(() => this.realEmit(ev));
    this.emitTail = next.catch(() => {});
    return next;
  }

  private getOrCreateFragmentState(id: string): FragmentState {
    let state = this.fragmentStates.get(id);
    if (!state) {
      state = { id, status: "pending", events: [], settled: false };
      this.fragmentStates.set(id, state);
    }
    return state;
  }

  private getOrCreateGroupState(group: DeferGroupData): GroupState {
    let state = this.groupStates.get(group.id);
    if (!state) {
      state = { group, frontierIndex: 0, flushed: false };
      this.groupStates.set(group.id, state);
    }
    return state;
  }

  private getGroupForFragment(id: string): DeferGroupData | undefined {
    const entry = this.store.get(id);
    if (!entry?.deferGroupId) return undefined;
    return this.store.getDeferGroup(entry.deferGroupId);
  }

  private getRootGroup(group: DeferGroupData): DeferGroupData {
    let curr = group;
    while (curr.parentId) {
      const parent = this.store.getDeferGroup(curr.parentId);
      if (!parent) break;
      curr = parent;
    }
    return curr;
  }

  createEmit(id: string): Emit {
    return async (ev: FlowEvent): Promise<void> => {
      const group = this.getGroupForFragment(id);
      if (!group) {
        await this.safeEmit(ev);
        return;
      }

      const state = this.getOrCreateFragmentState(id);

      // If already revealed as a stream, subsequent chunks pass through directly
      if (state.streamRevealed) {
        await this.safeEmit(ev);
        return;
      }

      state.events.push(ev);
      state.status = "ready";

      // If this fragment is a stream and is waiting for its turn in sequential mode,
      // create a turn barrier so the async generator pauses until its turn arrives
      const gState = this.getOrCreateGroupState(group);
      const isFrontier =
        !group.together &&
        gState.frontierIndex < group.items.length &&
        group.items[gState.frontierIndex]?.kind === "fragment" &&
        (group.items[gState.frontierIndex] as { id: string }).id === id;

      let barrier: Promise<void> | undefined;
      if (!group.together && !isFrontier) {
        const { promise, resolve } = Promise.withResolvers<void>();
        state.waitTurnPromise = promise;
        state.waitTurnResolve = resolve;
        barrier = promise;
      }

      await this.tryFlush();

      if (barrier) {
        await barrier;
      }
    };
  }

  async handleSettled(id: string): Promise<void> {
    const state = this.getOrCreateFragmentState(id);
    state.settled = true;
    if (state.status === "pending") {
      state.status = "settled";
    }
    state.waitTurnResolve?.();
    await this.tryFlush();
  }

  async tryFlush(): Promise<void> {
    for (const group of this.findRootGroups()) {
      await this.flushGroup(group);
    }
    await this.emitTail;
  }

  private findRootGroups(): DeferGroupData[] {
    const roots: DeferGroupData[] = [];
    const seen = new Set<string>();

    for (const [, state] of this.fragmentStates) {
      const group = this.getGroupForFragment(state.id);
      if (group) {
        const root = this.getRootGroup(group);
        if (!seen.has(root.id)) {
          seen.add(root.id);
          roots.push(root);
        }
      }
    }

    return roots;
  }

  private isItemReadyOrSettled(item: DeferItem): boolean {
    if (item.kind === "fragment") {
      const state = this.fragmentStates.get(item.id);
      return state ? state.status === "ready" || state.settled : false;
    } else {
      const gState = this.getOrCreateGroupState(item.group);
      if (gState.flushed) return true;
      return item.group.items.every((child) => this.isItemReadyOrSettled(child));
    }
  }

  private async flushGroup(group: DeferGroupData): Promise<void> {
    const gState = this.getOrCreateGroupState(group);
    if (gState.flushed) return;

    if (group.together) {
      const allReady = group.items.every((item) => this.isItemReadyOrSettled(item));
      if (!allReady) return;

      for (const item of group.items) {
        if (item.kind === "fragment") {
          await this.flushFragment(item.id);
        } else {
          await this.flushGroup(item.group);
        }
      }
      gState.flushed = true;
      return;
    }

    // Sequential mode
    while (gState.frontierIndex < group.items.length) {
      const item = group.items[gState.frontierIndex]!;

      if (item.kind === "fragment") {
        const fState = this.fragmentStates.get(item.id);
        const isReady = fState && (fState.status === "ready" || fState.settled);

        if (!isReady) {
          break;
        }

        // Unblock stream barrier if waiting
        fState.waitTurnResolve?.();
        fState.streamRevealed = true;

        // Flush any buffered events for this fragment
        await this.flushFragment(item.id);
        gState.frontierIndex++;
      } else {
        // Child group
        await this.flushGroup(item.group);
        const childGState = this.getOrCreateGroupState(item.group);
        if (childGState.flushed) {
          gState.frontierIndex++;
        } else {
          break;
        }
      }
    }

    if (gState.frontierIndex >= group.items.length) {
      gState.flushed = true;
    }
  }

  private async flushFragment(id: string): Promise<void> {
    const state = this.fragmentStates.get(id);
    if (!state || state.events.length === 0) return;

    const eventsToEmit = [...state.events];
    state.events.length = 0;
    for (const ev of eventsToEmit) {
      await this.safeEmit(ev);
    }
  }
}
