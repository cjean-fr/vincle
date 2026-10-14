import { expect, it } from "bun:test";

import { normalizePublicationDate, isPublished } from "../src/lib/pages.js";

it("accepts optional ISO dates, zoned timestamps and YAML Date objects", () => {
  expect(normalizePublicationDate(undefined, "page.mdx")).toBeUndefined();
  expect(normalizePublicationDate("2026-10-12", "page.mdx")).toBe("2026-10-12");
  expect(normalizePublicationDate("2026-10-12T08:30:00+02:00", "page.mdx")).toBe(
    "2026-10-12T08:30:00+02:00",
  );
  expect(normalizePublicationDate(new Date("2026-10-12"), "page.mdx")).toBe(
    "2026-10-12T00:00:00.000Z",
  );
});

it("rejects invalid calendar dates, missing timezone and wrong value types", () => {
  for (const value of [
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-10-12T08:30:00",
    "2026-10-12T24:00:00Z",
    "tomorrow",
    "",
    20261012,
    null,
    new Date("invalid"),
  ]) {
    expect(() => normalizePublicationDate(value, "page.mdx")).toThrow(
      "page.mdx: published_at must be an ISO date",
    );
  }
});

it("includes undated, past and today's pages and excludes future pages", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  expect(isPublished({}, now)).toBe(true);
  expect(isPublished({ published_at: "2026-10-11" }, now)).toBe(true);
  expect(isPublished({ published_at: "2026-10-12" }, now)).toBe(true);
  expect(isPublished({ published_at: "2026-10-13" }, now)).toBe(false);
  expect(isPublished({ published_at: "2026-10-12T12:00:00+02:00" }, now)).toBe(true);
  expect(isPublished({ published_at: "2026-10-12T12:00:01+02:00" }, now)).toBe(false);
});
