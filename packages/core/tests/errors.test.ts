import { describe, expect, it } from "bun:test";

import { jsx } from "../src/jsx-runtime.js";
import { Scope } from "../src/scope.js";

describe("error codes", () => {
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
    const Theme = Scope.key<string>("errors.test:theme");
    await expect(Scope.with(async () => Scope.get(Theme))).rejects.toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_CONTEXT_UNSET" }),
    );
  });
});
