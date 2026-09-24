import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, runCli } from "./cli.js";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "create-vincle-cli-"));
}

describe("parseArgs", () => {
  it("parses the documented command shape", () => {
    expect(
      parseArgs([
        "my-app",
        "--runtime=node",
        "--name",
        "My App",
        "--no-install",
        "--force",
        "--yes",
      ]),
    ).toEqual({
      target: "my-app",
      runtime: "node",
      name: "My App",
      install: false,
      force: true,
      yes: true,
      help: false,
      version: false,
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--unknown"])).toThrow("Unknown option");
  });
});

describe("runCli", () => {
  it("uses the detected runtime when --yes is present", async () => {
    const cwd = await temporaryDirectory();
    const output: string[] = [];
    try {
      const result = await runCli(["app", "--yes", "--no-install"], {
        cwd,
        detectedRuntime: "deno",
        interactive: true,
        ask: async () => {
          throw new Error("the prompt should not run");
        },
        stdout: (message) => output.push(message),
      });
      expect(result?.runtime).toBe("deno");
      expect(output.join("")).toContain("Runtime: Deno");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("honors an explicit runtime without prompting", async () => {
    const cwd = await temporaryDirectory();
    try {
      const result = await runCli(["app", "--runtime", "node", "--no-install"], {
        cwd,
        detectedRuntime: "bun",
        interactive: true,
        ask: async () => {
          throw new Error("the prompt should not run");
        },
        stdout: () => undefined,
      });
      expect(result?.runtime).toBe("node");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
