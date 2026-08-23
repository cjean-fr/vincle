import { describe, expect, it } from "bun:test";
import path from "node:path";

import { resolveExampleSrc } from "./CodeExample.js";

const EXAMPLES_DIR = path.resolve(import.meta.dirname, "../examples");

describe("resolveExampleSrc", () => {
  it("resolves a plain relative src inside the examples directory", () => {
    expect(resolveExampleSrc(EXAMPLES_DIR, "home/hello.tsx")).toBe(
      path.join(EXAMPLES_DIR, "home/hello.tsx"),
    );
  });

  it("resolves a dotted segment that stays inside (a..b)", () => {
    expect(resolveExampleSrc(EXAMPLES_DIR, "a..b/c.tsx")).toBe(
      path.join(EXAMPLES_DIR, "a..b/c.tsx"),
    );
  });

  it("rejects a src that escapes with ..", () => {
    expect(() => resolveExampleSrc(EXAMPLES_DIR, "../../package.json")).toThrow(
      /resolves outside the examples directory/,
    );
  });

  it("rejects a src that escapes one level up", () => {
    expect(() => resolveExampleSrc(EXAMPLES_DIR, "../config.ts")).toThrow(
      /resolves outside the examples directory/,
    );
  });

  it("rejects an absolute src", () => {
    expect(() => resolveExampleSrc(EXAMPLES_DIR, "/etc/passwd")).toThrow(
      /resolves outside the examples directory/,
    );
  });

  it("rejects the examples directory itself — a directory, not a file", () => {
    expect(() => resolveExampleSrc(EXAMPLES_DIR, ".")).toThrow(
      /resolves outside the examples directory/,
    );
    expect(() => resolveExampleSrc(EXAMPLES_DIR, "")).toThrow(
      /resolves outside the examples directory/,
    );
  });

  it("resolves against a relative examplesDir as the build passes it", () => {
    expect(resolveExampleSrc("docs-src/examples", "home/hello.tsx")).toBe(
      path.resolve("docs-src/examples/home/hello.tsx"),
    );
    expect(() => resolveExampleSrc("docs-src/examples", "../../docs-src/config.ts")).toThrow(
      /resolves outside the examples directory/,
    );
  });
});
