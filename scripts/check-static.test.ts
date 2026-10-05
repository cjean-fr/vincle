import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { inspectSource } from "./check-static.js";

const file = resolve(import.meta.dir, "../packages/core/src/fixture.ts");

test("coded errors and caller rethrows are allowed; comments and strings are ignored", () => {
  expect(
    inspectSource(
      file,
      `
    // throw new Error("comment");
    const example = 'throw new Error("example")';
    throw vincleError("message", CODE);
    throw error;
  `,
    ),
  ).toEqual([]);
});

test("new errors are rejected, including built-in qualified constructors", () => {
  expect(
    inspectSource(file, 'throw new TypeError("bad"); throw new globalThis.Error("bad");'),
  ).toHaveLength(2);
});

test.each([
  'import type { FlowConfig } from "@vincle/flow";',
  'export { Slot } from "@vincle/flow/components";',
  'const flow = import("../../flow/src/index.js");',
  'const flow = require("@vincle/flow");',
  'type Config = import("@vincle/flow").FlowConfig;',
  'import Flow = require("@vincle/flow");',
  'export * from "../../precompile/src/index.js";',
])("Core rejects integration imports: %s", (source) => {
  expect(inspectSource(file, source)).toHaveLength(1);
});

test("Core's local and self imports are allowed; integrations can depend on Core", () => {
  expect(
    inspectSource(file, 'import { JSX } from "@vincle/core"; export * from "./types.js";'),
  ).toEqual([]);
  expect(
    inspectSource(
      resolve(import.meta.dir, "../packages/flow/src/fixture.ts"),
      'import { JSX } from "@vincle/core";',
    ),
  ).toEqual([]);
});
