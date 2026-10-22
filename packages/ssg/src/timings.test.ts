import { expect, test } from "bun:test";

import type { BuildPageTiming, BuildTimings } from "./timings.js";

import { createTimings, formatTimings } from "./timings.js";

const EXAMPLE_REPORT = `build timings  total 412 ms
  phases (sequential)
    configuration            3 ms   0.7%
    source inspection        1 ms   0.2%
    assets prepare         118 ms  28.6%
    discovery               24 ms   5.8%
    cleanup                  2 ms   0.5%
  page rendering (active)  195 ms  47.3%  · 3 pages
  publication (wall)       258 ms  62.6%  · 12 files, includes rendering
  slowest pages (median 62 ms · p95 78 ms)
    /guide/article          78 ms  3 outputs
    /                       62 ms  1 output
    /hello                  55 ms  1 output`;

function report(milliseconds: readonly number[]): BuildTimings {
  return {
    phases: [],
    pages: milliseconds.map((value, index) => ({
      route: `/${index}`,
      milliseconds: value,
      outputs: 1,
    })),
    total: 1000,
  };
}

function statsLine(output: string): string {
  return output.split("\n").find((line) => line.startsWith("  slowest pages"))!;
}

function pageLines(output: string): string[] {
  return output.split("\n").filter((line) => line.startsWith("    /"));
}

test("formatTimings prints the plan example report with aligned columns", () => {
  const output = formatTimings({
    phases: [
      { name: "configuration", milliseconds: 3 },
      { name: "source inspection", milliseconds: 1 },
      { name: "assets prepare", milliseconds: 118 },
      { name: "discovery", milliseconds: 24 },
      { name: "cleanup", milliseconds: 2 },
    ],
    pages: [
      { route: "/guide/article", milliseconds: 78, outputs: 3 },
      { route: "/", milliseconds: 62, outputs: 1 },
      { route: "/hello", milliseconds: 55, outputs: 1 },
    ],
    publication: { milliseconds: 258, files: 12 },
    total: 412,
  });
  expect(output).toBe(EXAMPLE_REPORT);
});

test("formatTimings renders totals of one second or more in seconds", () => {
  expect(formatTimings({ phases: [], pages: [], total: 1234 })).toBe("build timings  total 1.23 s");
  const zero = formatTimings({
    phases: [{ name: "cleanup", milliseconds: 0 }],
    pages: [{ route: "/", milliseconds: 0, outputs: 1 }],
    total: 0,
  });
  expect(zero.split("\n")[0]).toBe("build timings  total 0 ms");
  expect(zero).toContain("0.0%");
  expect(zero).toContain("  · 1 page");
});

test("formatTimings omits empty sections and keeps the header alone", () => {
  expect(formatTimings({ phases: [], pages: [], total: 5 })).toBe("build timings  total 5 ms");
});

test("formatTimings reports median and p95 with nearest rank for odd and even page counts", () => {
  expect(statsLine(formatTimings(report([10])))).toBe("  slowest pages (median 10 ms · p95 10 ms)");
  expect(statsLine(formatTimings(report([10, 20])))).toBe(
    "  slowest pages (median 15 ms · p95 20 ms)",
  );
  expect(statsLine(formatTimings(report([10, 20, 30, 40])))).toBe(
    "  slowest pages (median 25 ms · p95 40 ms)",
  );
  expect(statsLine(formatTimings(report([10, 20, 30, 40, 50])))).toBe(
    "  slowest pages (median 30 ms · p95 50 ms)",
  );
});

test("formatTimings keeps only the three slowest pages and breaks ties by route", () => {
  const output = formatTimings({
    phases: [],
    pages: [
      { route: "/b", milliseconds: 40, outputs: 1 },
      { route: "/d", milliseconds: 20, outputs: 1 },
      { route: "/a", milliseconds: 40, outputs: 1 },
      { route: "/e", milliseconds: 10, outputs: 1 },
      { route: "/c", milliseconds: 30, outputs: 1 },
    ],
    total: 200,
  });
  expect(pageLines(output)).toEqual([
    "    /a                      40 ms  1 output",
    "    /b                      40 ms  1 output",
    "    /c                      30 ms  1 output",
  ]);
});

test("formatTimings singularises one page, one file and one output", () => {
  const output = formatTimings({
    phases: [],
    pages: [{ route: "/x", milliseconds: 5, outputs: 1 }],
    publication: { milliseconds: 3, files: 1 },
    total: 10,
  });
  expect(output).toContain("  · 1 page");
  expect(output).toContain("  · 1 file, includes rendering");
  expect(output).toContain("1 output");
});

test("formatTimings neutralises ANSI escapes and control characters in routes", () => {
  const output = formatTimings({
    phases: [],
    pages: [
      { route: "/a\x1b[2Jb", milliseconds: 12, outputs: 1 },
      { route: "/c\r\n", milliseconds: 18, outputs: 2 },
    ],
    total: 30,
  });
  expect(output).toBe(
    `build timings  total 30 ms
  page rendering (active)   30 ms 100.0%  · 2 pages
  slowest pages (median 15 ms · p95 18 ms)
    /c\\x0d\\x0a              18 ms  2 outputs
    /a\\x1b[2Jb              12 ms  1 output`,
  );
  expect(output).not.toContain("\x1b");
  expect(output).not.toContain("\r");
});

test("createTimings records phases in call order, pages with their output count and one publication", () => {
  const timings = createTimings(() => 0);
  timings.phase("discovery", 12);
  timings.phase("configuration", 3);
  timings.page("/guide", 20, 2);
  timings.page("/", 5, 1);
  timings.publication(30, 4);
  const snapshot = timings.snapshot();
  expect(snapshot.phases.map((phase) => phase.name)).toEqual(["discovery", "configuration"]);
  expect(snapshot.pages).toEqual([
    { route: "/guide", milliseconds: 20, outputs: 2 },
    { route: "/", milliseconds: 5, outputs: 1 },
  ]);
  expect(snapshot.publication).toEqual({ milliseconds: 30, files: 4 });
  expect(createTimings(() => 0).snapshot().publication).toBeUndefined();
});

test("createTimings measures total from creation to snapshot with the injected clock", () => {
  let clock = 100;
  const timings = createTimings(() => clock);
  clock = 142;
  expect(timings.snapshot().total).toBe(42);
});

test("createTimings snapshot copies the recorded collections", () => {
  const timings = createTimings(() => 0);
  timings.page("/", 1, 1);
  const snapshot = timings.snapshot();
  (snapshot.pages as BuildPageTiming[]).push({ route: "/x", milliseconds: 1, outputs: 1 });
  expect(snapshot.pages).toHaveLength(2);
  expect(timings.snapshot().pages).toHaveLength(1);
});
