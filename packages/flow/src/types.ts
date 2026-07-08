import type { Adapter } from "./adapters/index.js";
import type { VincleNode } from "@vincle/core";

export type MergeType = "replace" | "append" | "prepend" | "before" | "after";

export interface AdapterCapabilities {
  streaming: boolean;
  merges: readonly MergeType[];
}

export type DeferContent = VincleNode | ((signal: AbortSignal) => VincleNode);

export interface Shell {
  type: "shell";
  html: string;
}

export interface Fragment {
  type: "fragment";
  id: string;
  html: string;
  merge: MergeType;
}

export type FlowEvent = Shell | Fragment | { type: "close"; html: string };

export type FlowErrorInfo = { id: string; kind: "fragment" | "stream" };

export type OnError = (
  error: unknown,
  info: FlowErrorInfo,
) => VincleNode | void;

export interface FlowOptions {
  signal?: AbortSignal;
  onError?: OnError;
  defaultTimeout?: number;
}

export type FlowConfig =
  | {
      adapter: Adapter;
      mode: "streaming";
      generatePath?: never;
      idPrefix?: string;
    }
  | {
      adapter?: Adapter;
      mode: "static";
      generatePath: (id: string) => string;
      idPrefix?: string;
    };

export interface Negotiation {
  headers?: HeadersInit;
  mode?: "full" | "fragment";
  target?: string;
}

export type Negotiate = (req: Request) => Negotiation;

export type StreamingAdapter = Adapter & {
  capabilities: { streaming: true };
};
