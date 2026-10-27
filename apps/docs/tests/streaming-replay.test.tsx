import { renderToString } from "@vincle/core";
import { it, expect } from "bun:test";

import StreamingReplay from "../src/components/StreamingReplay";

it("replays the real wire output of the home streaming example", async () => {
  const html = await renderToString(<StreamingReplay />);
  // State 1 is the shell with its fallback, state 2 the same shell patched:
  // both come from the code shown in the fence, not from a mockup.
  expect(html).toContain("1 · The shell arrives first");
  expect(html).toContain("2 · The patch replaces the fallback");
  // The fallback survives in state 1 only: the patch replaced it in state 2.
  expect(html.match(/Loading results…/g)).toHaveLength(1);
  expect(html).toContain("Getting started");
  // The raw patch stays inspectable.
  expect(html).toContain("&lt;template data-for=");
});
