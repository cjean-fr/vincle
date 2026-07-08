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

  it("resolves a Promise child and renders its value", async () => {
    const result = await renderChild(Promise.resolve("async text"));
    expect(result).toBe("async text");
  });

  it("renders RawString verbatim without escaping", () => {
    const result = renderChild(raw("<b>raw</b>"));
    expect(result).toBe("<b>raw</b>");
  });

  it("escapes HTML special chars in plain string children", () => {
    expect(renderChild("hello")).toBe("hello");
    expect(renderChild("<b>")).toBe("&lt;b&gt;");
  });

  it("coerces number 0 to string (not falsy-drop)", () => {
    expect(renderChild(42)).toBe("42");
  });

  it("produces empty string from an empty array", () => {
    expect(renderChild([])).toBe("");
  });

  it("joins synchronous array children in order", () => {
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
