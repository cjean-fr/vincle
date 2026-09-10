import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { useContext, context, withScope } from "./context.js";
import { jsx } from "./jsx-runtime.js";

/**
 * A code is only worth having if every error carries one, and a behavioural test
 * covers the paths it happens to exercise. So the guard is on the source: a
 * coded throw reads `throw vincleError(…, CODE)`, which means the literal
 * `throw new Error(` cannot appear. Any that does is a throw someone added
 * without a code, and this fails naming the file.
 *
 * A bare `throw error` — the rethrows in `render.ts` that re-raise what a
 * component threw — is deliberately not matched: those errors are the caller's,
 * and stamping a vincle code on them would be a lie.
 */
const UNCODED_THROW = /\bthrow\s+new\s+\w*Error\s*\(/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(path);
  }
  return out;
}

/**
 * Every package, from one file. The convention is the workspace's, not this
 * package's — a second copy of this scan in each of the other five would rot
 * apart from it, and every package's tests run together in CI anyway.
 */
const PACKAGES = join(import.meta.dir, "..", "..");

describe("error codes", () => {
  it("every thrown error is stamped — no bare `throw new Error(`", () => {
    const offenders: string[] = [];
    for (const pkg of readdirSync(PACKAGES)) {
      const src = join(PACKAGES, pkg, "src");
      if (!statSync(src, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const file of sourceFiles(src)) {
        const text = readFileSync(file, "utf8");
        for (const match of text.matchAll(UNCODED_THROW)) {
          const line = text.slice(0, match.index).split("\n").length;
          offenders.push(`${pkg}/${file.split("/src/")[1]}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names an invalid tag", () => {
    expect(() => jsx("a b", {})).toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_INVALID_TAG" }),
    );
  });

  it("names content inside a void element", () => {
    expect(() => jsx("br", { children: "x" })).toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_VOID_CHILDREN" }),
    );
  });

  it("names a function passed as an attribute value", () => {
    // Thrown by `jsx()` on the static path, before any render is awaited.
    expect(() => jsx("div", { title: () => "x" })).toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_FUNCTION_ATTR" }),
    );
  });

  it("names a context read that was never set", async () => {
    const Theme = context<string>("errors.test:theme");
    await expect(withScope(async () => useContext(Theme))).rejects.toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_CONTEXT_UNSET" }),
    );
  });
});
