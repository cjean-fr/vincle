import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProject, normalizePackageName } from "./project.js";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "create-vincle-"));
}

describe("normalizePackageName", () => {
  it("creates a valid package name from a directory", () => {
    expect(normalizePackageName("My Vincle App")).toBe("my-vincle-app");
    expect(normalizePackageName("123-app")).toBe("vincle-123-app");
    expect(normalizePackageName("")).toBe("vincle-app");
  });
});

describe("createProject", () => {
  it("writes the selected template and skips installation when requested", async () => {
    const cwd = await temporaryDirectory();
    try {
      const result = await createProject({
        cwd,
        target: "bun-app",
        runtime: "bun",
        install: false,
      });
      const packageFile = JSON.parse(
        await readFile(join(result.target, "package.json"), "utf8"),
      ) as { name: string };
      expect(result.packageName).toBe("bun-app");
      expect(packageFile.name).toBe("bun-app");
      expect(result.files).toContain("server.tsx");
      expect(result.files).toContain(".gitignore");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("passes the generated directory to the selected installer", async () => {
    const cwd = await temporaryDirectory();
    const calls: Array<[string, string]> = [];
    try {
      await createProject({
        cwd,
        target: "node-app",
        runtime: "node",
        installDependencies: async (runtime, target) => {
          calls.push([runtime, target]);
        },
      });
      expect(calls).toEqual([["node", join(cwd, "node-app")]]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses a non-empty target unless force is requested", async () => {
    const cwd = await temporaryDirectory();
    try {
      const target = join(cwd, "existing");
      await createProject({ cwd, target, runtime: "deno", install: false });
      await writeFile(join(target, "keep.txt"), "keep");
      await expect(createProject({ cwd, target, runtime: "deno", install: false })).rejects.toThrow(
        "not empty",
      );

      await createProject({ cwd, target, runtime: "deno", install: false, force: true });
      expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("keep");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
