import { createElement } from "./src/create-element.js";

const PURCHASES = Array.from({ length: 10000 }, (_, i) => ({
  name: `Purchase number ${i + 1}`,
  price: i * 2,
  quantity: i * 5,
}));

// Build the full tree once
import { buildTree } from "../apps/bench/src/realworld/vincle-next-profile.js";

const tree = buildTree("John", PURCHASES);

// Warmup
for (let i = 0; i < 50; i++) createElement(tree);

// Profile helpers
const S = { escape: 0, attrs: 0, children: 0, total: 0 };
const orig = { escapeHtml: null as any, escapeAttr: null as any, buildAttrs: null as any, renderChildren: null as any };

// Need to import the module and patch — skip this manual approach
// Just do a simple timing breakdown instead

console.log("Manual breakdown (5 runs):");
for (const label of ["escapeHtml", "escapeAttr", "renderChildren", "buildAttrs"]) {
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) createElement(tree);
  console.log(`  ${label.padEnd(16)} ${(performance.now() - t0).toFixed(0)}ms (full render)`);
}

// Compare full render
const t0 = performance.now();
for (let i = 0; i < 200; i++) createElement(tree);
console.log(`  full render       ${(performance.now() - t0).toFixed(0)}ms`);
