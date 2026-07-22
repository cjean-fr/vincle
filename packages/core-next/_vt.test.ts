import { expect, test } from "bun:test";
import { jsx } from "./src/jsx-runtime.js";
import { renderToString } from "./src/create-element.js";
// static fast-path (jsx pre-renders to RawString)
test("void static", () => { expect(renderToString(jsx("br", {}))).toBe("<br>"); });
test("void static img", () => { expect(renderToString(jsx("img", { src: "/a.png" }))).toBe('<img src="/a.png">'); });
// dynamic path (component forces VNode walk)
test("void dynamic", () => {
  const C = () => jsx("br", {});
  expect(renderToString(jsx(C as any, {}))).toBe("<br>");
});
