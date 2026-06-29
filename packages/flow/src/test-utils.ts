import type { FlowEvent } from "./types.js";

export const collect = async (s: ReadableStream<string>): Promise<string> => {
  let out = "";
  for await (const c of s) out += c;
  return out;
};

export const collectEvents = async (
  s: ReadableStream<FlowEvent>,
): Promise<FlowEvent[]> => {
  const events: FlowEvent[] = [];
  for await (const ev of s) events.push(ev);
  return events;
};

export type FragmentEvent = FlowEvent & { type: "fragment" };
