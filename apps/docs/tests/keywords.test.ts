import { expect, it } from "bun:test";

import { normalizeKeywords } from "../src/lib/pages.js";

it("leaves absent or empty keywords undefined", () => {
  expect(normalizeKeywords(undefined, "page.mdx")).toBeUndefined();
  expect(normalizeKeywords("", "page.mdx")).toBeUndefined();
  expect(normalizeKeywords([], "page.mdx")).toBeUndefined();
  expect(normalizeKeywords(" , ,", "page.mdx")).toBeUndefined();
});

it("accepts a list or a comma-separated string, trimmed and de-duplicated", () => {
  expect(normalizeKeywords(["ssr", " streaming ", "ssr", ""], "page.mdx")).toEqual([
    "ssr",
    "streaming",
  ]);
  expect(normalizeKeywords("ssr, streaming ,ssr", "page.mdx")).toEqual(["ssr", "streaming"]);
});

it("rejects other value types, naming the file", () => {
  for (const value of [42, true, null, { a: 1 }, ["ok", 1], [["nested"]]]) {
    expect(() => normalizeKeywords(value, "page.mdx")).toThrow(
      "page.mdx: keywords must be a list of strings or a comma-separated string.",
    );
  }
});
