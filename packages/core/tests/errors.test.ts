import { describe, expect, it } from "bun:test";

import { jsx } from "../src/jsx-runtime.js";
import { renderToString } from "../src/render.js";
import { Scope } from "../src/scope.js";

// `jsx()` builds the neutral tree without judging it: errors that used to be
// thrown at construction are rejected at render, where the parse context
// exists. The code and message are unchanged; only the surface moved.

describe("error codes", () => {
  it("names an invalid tag", () => {
    expect(() => jsx("a b", {})).toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_INVALID_TAG" }),
    );
  });

  it("names content inside a void element", async () => {
    await expect(renderToString(jsx("br", { children: "x" }))).rejects.toThrow(
      expect.objectContaining({ code: "ERR_VINCLE_VOID_CHILDREN" }),
    );
  });

  it("names a function passed as an attribute value", async () => {
    await expect(renderToString(jsx("div", { title: () => "x" }))).rejects.toThrow(
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
