import { describe, it, expect } from "bun:test";

import { renderToString } from "./index.js";
import { jsx } from "./jsx-runtime.js";

const DIV = jsx("div", { class: "foo", children: "hello" });

describe("renderToString — no major regression", () => {
  const N = 5000;

  it(`simple element: ${N}× under 200ms`, () => {
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      renderToString(DIV);
    }
    expect(performance.now() - start).toBeLessThan(200);
  });

  it(`deep tree (100× nested): ${N}× under 500ms`, () => {
    function deep(n: number): any {
      return n <= 0 ? jsx("span", { children: "x" }) : jsx("div", { children: deep(n - 1) });
    }
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      renderToString(deep(100));
    }
    expect(performance.now() - start).toBeLessThan(500);
  });

  it(`wide tree (100 children): ${N}× under 500ms`, () => {
    const children = Array.from({ length: 100 }, (_, i) =>
      jsx("span", { class: `c-${i}`, children: `item-${i}` }),
    );
    const tree = jsx("div", { children });
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      renderToString(tree);
    }
    expect(performance.now() - start).toBeLessThan(500);
  });

  it(`style attribute (CSS hex-escape safe): ${N}× under 500ms`, () => {
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      renderToString(jsx("div", { style: "color:red;background:blue;", children: "x" }));
    }
    expect(performance.now() - start).toBeLessThan(500);
  });

  it(`style attribute (CSS hex-escape decode): ${N}× under 500ms`, () => {
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      renderToString(jsx("div", { style: "\\6a\\61va", children: "x" }));
    }
    expect(performance.now() - start).toBeLessThan(500);
  });
});
