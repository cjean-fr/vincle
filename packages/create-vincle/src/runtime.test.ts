import { describe, expect, it } from "bun:test";

import { detectRuntime, parseRuntime, promptRuntime, runtimeQuestion } from "./runtime.js";

function scope(value: unknown): Parameters<typeof detectRuntime>[0] {
  return value as Parameters<typeof detectRuntime>[0];
}

describe("detectRuntime", () => {
  it("prefers Bun over a Node-compatible process shim", () => {
    expect(
      detectRuntime(
        scope({
          Bun: { version: "1.4.2" },
          process: { versions: { node: "22.0.0" } },
        }),
      ),
    ).toBe("bun");
  });

  it("prefers Deno over a Node-compatible process shim", () => {
    expect(
      detectRuntime(
        scope({
          Deno: { version: { deno: "2.9.6" } },
          process: { versions: { node: "22.0.0" } },
        }),
      ),
    ).toBe("deno");
  });

  it("detects Node from its process version", () => {
    expect(detectRuntime(scope({ process: { versions: { node: "22.0.0" } } }))).toBe("node");
  });

  it("returns undefined for an unknown host", () => {
    expect(detectRuntime(scope({}))).toBeUndefined();
  });
});

describe("runtime selection", () => {
  it("accepts names, aliases, and empty input", () => {
    expect(parseRuntime("bun")).toBe("bun");
    expect(parseRuntime("2")).toBe("node");
    expect(parseRuntime("", "deno")).toBe("deno");
    expect(parseRuntime("unknown")).toBeUndefined();
  });

  it("uses the detected runtime as the interactive default", async () => {
    const questions: string[] = [];
    const errors: string[] = [];
    const answers = ["wrong", "3"];

    const selected = await promptRuntime(
      "bun",
      async (question) => {
        questions.push(question);
        return answers.shift() ?? "";
      },
      (message) => errors.push(message),
    );

    expect(selected).toBe("deno");
    expect(questions[0]).toBe(runtimeQuestion("bun"));
    expect(errors).toEqual(["Choose 1, 2, 3, Bun, Node.js, or Deno."]);
  });

  it("repeats the prompt after an invalid answer", async () => {
    const errors: string[] = [];
    let attempts = 0;
    const selected = await promptRuntime(
      "node",
      async () => {
        attempts += 1;
        return attempts === 1 ? "wrong" : "";
      },
      (message) => errors.push(message),
    );

    expect(selected).toBe("node");
    expect(errors).toEqual(["Choose 1, 2, 3, Bun, Node.js, or Deno."]);
  });
});
