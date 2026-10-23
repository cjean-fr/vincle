import { expect, test, it } from "bun:test";

import { outputPathForRoute, fullUrl } from "../src/routes.js";

test("keeps explicit output suffixes and uses directory indexes for extensionless HTML routes", () => {
  expect(outputPathForRoute("/404.html")).toBe("404.html");
  expect(outputPathForRoute("/errors/418.html")).toBe("errors/418.html");
  expect(outputPathForRoute("/")).toBe("index.html");
  expect(outputPathForRoute("/cv")).toBe("cv/index.html");
  expect(outputPathForRoute("/feed.xml", ".xml")).toBe("feed.xml");
});

it("resolves routes with or without boundary slashes", () => {
  expect(fullUrl("/guide", "https://example.test/")).toBe("https://example.test/guide");
  expect(fullUrl("guide", "https://example.test")).toBe("https://example.test/guide");
  expect(fullUrl("/", "https://example.test")).toBe("https://example.test/");
});

it("preserves the site path and applies the deployment base once", () => {
  expect(fullUrl("/fr/guide", "https://example.test/docs/")).toBe(
    "https://example.test/docs/fr/guide",
  );
  expect(fullUrl("/", "https://example.test/docs/")).toBe("https://example.test/docs/");
  expect(fullUrl("/guide", "https://example.test/project/docs/")).toBe(
    "https://example.test/project/docs/guide",
  );
});

it("normalizes URLs and excludes query and fragment from the site base", () => {
  expect(fullUrl("/guide", "https://example.test/project?lang=fr#intro")).toBe(
    "https://example.test/project/guide",
  );
  expect(fullUrl("/guide/a b", "https://example.test")).toBe("https://example.test/guide/a%20b");
});

it("keeps relative routes when no public site is configured and does not mutate URL inputs", () => {
  expect(fullUrl("/guide")).toBe("/guide");
  const site = new URL("https://example.test/docs?lang=fr#intro");
  expect(fullUrl("/guide", site)).toBe("https://example.test/docs/guide");
  expect(site.href).toBe("https://example.test/docs?lang=fr#intro");
});
