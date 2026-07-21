import { generatePurchases } from "./realworld/data.js";
import { render } from "./realworld/kita-clone.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);

for (let i = 0; i < 20; i++) render(NAME, PURCHASES);

const N = 200;
const wall0 = performance.now();
for (let i = 0; i < N; i++) render(NAME, PURCHASES);
const wallMs = performance.now() - wall0;

console.log(`kita-clone ×10 (${N} iters):`);
console.log(`  wall:    ${wallMs.toFixed(0)}ms`);
