import { expect, test } from "bun:test";

import { groupToc } from "../src/lib/toc.js";

test("nests h3 under the preceding h2 and keeps a leading h3 alone", () => {
  const entry = (id: string, level: number) => ({ id, text: id, level });
  expect(groupToc([entry("lead", 3), entry("a", 2), entry("a1", 3), entry("b", 2)])).toEqual([
    { ...entry("lead", 3), children: [] },
    { ...entry("a", 2), children: [entry("a1", 3)] },
    { ...entry("b", 2), children: [] },
  ]);
});
