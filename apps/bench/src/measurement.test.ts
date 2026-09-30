import { describe, expect, it } from "bun:test";

import { comparisonDelta, environmentDifferences, readMeasurement } from "./measurement.js";

describe("benchmark comparisons", () => {
  it("compares ratios even when absolute throughput moves in the opposite direction", () => {
    const before = { mean: 100, sd: 2, n: 8, ratio: 2, ratioSd: 0.02 };
    const after = { mean: 80, sd: 2, n: 8, ratio: 2.4, ratioSd: 0.02 };
    expect(comparisonDelta(after, before)?.delta).toBeCloseTo(20);
    expect(comparisonDelta(after, before, "throughput")?.delta).toBeCloseTo(-20);
    expect(comparisonDelta(after, before)?.sigmas).toBeGreaterThan(3);
  });

  it("does not report a difference for identical zero-variance samples", () => {
    const sample = { n: 8, ratio: 2, ratioSd: 0 };
    expect(comparisonDelta(sample, sample)).toEqual({ before: 2, after: 2, delta: 0, sigmas: 0 });
  });

  it("does not substitute throughput when a historical ratio is missing", () => {
    expect(comparisonDelta({ mean: 100, sd: 2, n: 8 }, { mean: 90, sd: 2, n: 8 })).toBeUndefined();
  });

  it("reads legacy output and metadata emitted after measurement", () => {
    const rows = [{ case: "text", name: "@vincle/core", opsPerSec: 100 }];
    const stdout = `runtime chatter\n${JSON.stringify(rows)}\n`;
    expect(readMeasurement(stdout, "")).toEqual({ rows, environment: undefined });
    expect(
      readMeasurement(stdout, 'VINCLE_BENCH_METADATA {"runtime":{"name":"node","version":"v24"}}\n')
        .environment?.runtime.name,
    ).toBe("node");
    expect(() => readMeasurement("", "")).toThrow("no JSON");
  });

  it("detects harness and competitor changes, while allowing Core changes", () => {
    const environment = {
      runtime: { name: "bun", version: "1" },
      host: { arch: "x64" },
      dependencies: { hono: "4" },
      harness: { sha256: "abc", sampling: "defaults" },
      core: { sha256: "before" },
    };
    expect(
      environmentDifferences(environment, { ...environment, core: { sha256: "after" } }),
    ).toEqual([]);
    expect(
      environmentDifferences(environment, { ...environment, dependencies: { hono: "5" } }),
    ).toEqual(["dependencies"]);
    expect(
      environmentDifferences(environment, {
        ...environment,
        harness: { ...environment.harness, sha256: "def" },
      }),
    ).toEqual(["harness.sha256"]);
    expect(
      environmentDifferences(environment, {
        ...environment,
        harness: { ...environment.harness, cases: ["stack"] },
      }),
    ).toEqual(["harness.cases"]);
    expect(environmentDifferences(environment, undefined)).toEqual([]);
  });
});
