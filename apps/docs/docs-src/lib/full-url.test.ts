import { expect, it } from "bun:test";

import { fullUrl } from "./full-url.js";

it("resolves routes with or without boundary slashes", () => {
  expect(fullUrl("/guide", "https://example.test/")).toBe("https://example.test/guide");
  expect(fullUrl("guide", "https://example.test")).toBe("https://example.test/guide");
  expect(fullUrl("/", "https://example.test")).toBe("https://example.test/");
});

it("preserves the site path and applies the deployment base once", () => {
  expect(fullUrl("/fr/guide", "https://example.test", "/docs/")).toBe(
    "https://example.test/docs/fr/guide",
  );
  expect(fullUrl("/", "https://example.test", "docs")).toBe("https://example.test/docs/");
  expect(fullUrl("/guide", "https://example.test/project/", "/docs/")).toBe(
    "https://example.test/project/docs/guide",
  );
});

it("normalizes URLs and excludes query and fragment from the site base", () => {
  expect(fullUrl("/guide", "https://example.test/project?lang=fr#intro")).toBe(
    "https://example.test/project/guide",
  );
  expect(fullUrl("/guide/a b", "https://example.test")).toBe("https://example.test/guide/a%20b");
});
