import { describe, expect, it } from "bun:test";

import * as runtime from "../src/jsx-precompile-runtime.js";

// The jsx-precompile-runtime subpath is an internal contract surface, public
// by necessity: emitted code imports it. This test freezes the export list so
// an addition or removal is a deliberate, reviewed event — every name here is
// one a transform may emit a call to, and a surprise rename is a missing
// import in somebody's build.
describe("the jsx-precompile-runtime surface is frozen", () => {
  it("exports exactly the contract", () => {
    expect(Object.keys(runtime).toSorted()).toEqual([
      "jsxAttr",
      "jsxEscape",
      "jsxEscapeDeferred",
      "jsxStatic",
      "jsxTemplate",
      "jsxTemplateDeferred",
      "precompileDialect",
    ]);
  });

  it("the dialect value is the unversioned 'vincle'", () => {
    // Additive helpers (jsxStatic was one) are detected at build time and do
    // not change the value; only a breaking helper change does, to "vincle/2".
    expect(runtime.precompileDialect).toBe("vincle");
  });
});
