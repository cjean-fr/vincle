import { describe, expect, test } from "bun:test";

import type { PageContext, SsgOutput } from "../src/types.js";

import { publicUrl } from "../src/build.js";
import { decodedPathname, generatedFile } from "../src/dev.js";
import { markdownOutputs } from "../src/results.js";
import { outputPathForRoute } from "../src/routes.js";

// The URL a build publishes for an output must, requested as a browser sends it, serve that output in dev.
function served(output: SsgOutput, files: ReadonlySet<string>) {
  const pathname = decodedPathname(new URL(publicUrl(output), "http://localhost"));
  return pathname === undefined ? undefined : generatedFile(pathname.slice(1), files);
}

const routes = ["/", "/about", "/docs/guide", "/café", "/a b", "/100%", "/50%25", "/v1.2"];

describe("public URL ↔ served file", () => {
  for (const route of routes) {
    test(`route ${route}`, () => {
      const context = {
        route,
        outputPath: (extension?: string) => outputPathForRoute(route, extension),
      };
      const [page] = markdownOutputs(context as PageContext, "", () => null);
      const files = new Set([page!.path]);
      expect(served(page!, files)).toBe(page!.path);
      expect(served({ path: page!.path, content: "" }, files)).toBe(page!.path);
    });
  }

  test("non-HTML outputs keep their file path as URL", () => {
    for (const path of ["feed.xml", "about.html", "data/items.json", "about.md"]) {
      expect(served({ path, content: "" }, new Set([path]))).toBe(path);
    }
  });
});
