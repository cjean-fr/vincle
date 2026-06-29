import { RawString, raw } from "../core/types.js";
import { renderChild } from "./render-child.js";
import { expect, describe, it } from "bun:test";

describe("renderChild", () => {
  it("handles a mixed sync + async array", async () => {
    const mixed = [
      new RawString("<b>safe</b>"),
      Promise.resolve("raw & text"),
      Promise.resolve(new RawString("<i>also safe</i>")),
      "plain",
    ];
    const result = await renderChild(mixed);
    expect(result).toBe("<b>safe</b>raw &amp; text<i>also safe</i>plain");
  });

  it("handles a direct Promise child", async () => {
    const result = await renderChild(Promise.resolve("async text"));
    expect(result).toBe("async text");
  });

  it("handles a direct RawString child", () => {
    const result = renderChild(raw("<b>raw</b>"));
    expect(result).toBe("<b>raw</b>");
  });

  it("escapes a plain string child", () => {
    expect(renderChild("hello")).toBe("hello");
    expect(renderChild("<b>")).toBe("&lt;b&gt;");
  });

  it("handles a number child", () => {
    expect(renderChild(42)).toBe("42");
  });

  it("handles an empty array", () => {
    expect(renderChild([])).toBe("");
  });

  it("handles a fully synchronous array", () => {
    expect(renderChild(["a", "b", new RawString("<c>")])).toBe("ab<c>");
  });

  it("handles array with null/undefined/boolean values", () => {
    expect(renderChild(["a", null, undefined, false, true, "b"])).toBe("ab");
  });

  it("handles deeply nested promises in array", async () => {
    const result = await renderChild([
      Promise.resolve(Promise.resolve("deep")),
    ]);
    expect(result).toBe("deep");
  });
});
