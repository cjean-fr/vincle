import { describe, expect, test } from "bun:test";

import { ERR_FUNCTION_AS_TEXT } from "./errors.js";
import { jsx, jsxEscape, jsxTemplate } from "./jsx-runtime.js";
import { renderToString } from "./render.js";

const secretHandler = function secretHandler() {
  return "token-123";
};

async function code(run: () => unknown): Promise<unknown> {
  try {
    const out = await run();
    return `rendered: ${String(out)}`;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("a function child is an error, never its source", () => {
  const cases: Record<string, () => Promise<string>> = {
    "in an element": () => renderToString(jsx("div", { children: secretHandler })),
    "in an array": () => renderToString(jsx("p", { children: ["a", secretHandler] })),
    "nested in an array": () => renderToString(jsx("p", { children: [["a", [secretHandler]]] })),
    "in script": () => renderToString(jsx("script", { children: secretHandler })),
    "in style": () => renderToString(jsx("style", { children: secretHandler })),
    "in a fragment": () =>
      renderToString(jsx("div", { children: jsx("b", { children: secretHandler }) })),
    "an arrow": () => renderToString(jsx("p", { children: () => "x" })),
    "a component passed uncalled": () =>
      renderToString(
        jsx("p", {
          children: function Comp() {
            return jsx("b", {});
          },
        }),
      ),
    "through a template hole": async () =>
      renderToString(jsxTemplate(["<p>", "</p>"], secretHandler)),
    "through jsxEscape": async () => renderToString(jsxEscape(secretHandler)),
  };
  for (const [name, run] of Object.entries(cases)) {
    test(name, async () => {
      expect(await code(run)).toBe(ERR_FUNCTION_AS_TEXT);
    });
  }

  test("the message names the fix and never carries the source", async () => {
    const error = await renderToString(jsx("p", { children: secretHandler })).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("<Comp />");
    expect(error.message).not.toContain("token-123");
  });

  test("a promise of a function is refused too", async () => {
    const view = jsx("p", { children: Promise.resolve(secretHandler) });
    expect(await code(() => renderToString(view))).toBe(ERR_FUNCTION_AS_TEXT);
  });

  test("a called function and a component as JSX still render", async () => {
    function Comp() {
      return jsx("b", { children: "ok" });
    }
    expect(await renderToString(jsx("p", { children: secretHandler() }))).toBe("<p>token-123</p>");
    expect(await renderToString(jsx("p", { children: jsx(Comp, {}) }))).toBe("<p><b>ok</b></p>");
  });
});
