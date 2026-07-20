import { generatePurchases } from "./realworld/data.js";
import { PROFILE } from "@vincle/kita-html/jsx-runtime";
import { render } from "./realworld/kita-clone.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);

for (let i = 0; i < 20; i++) render(NAME, PURCHASES);

PROFILE.attrMs = 0;
PROFILE.contentMs = 0;

const N = 200;
const wall0 = performance.now();
for (let i = 0; i < N; i++) render(NAME, PURCHASES);
const wallMs = performance.now() - wall0;

const { attrMs, contentMs } = PROFILE;
console.log(`kita-clone ×10 (${N} iters):`);
console.log(`  wall:    ${wallMs.toFixed(0)}ms`);
console.log(`  attr:    ${attrMs.toFixed(0)}ms  ${(attrMs/wallMs*100).toFixed(1)}%`);
console.log(`  content: ${contentMs.toFixed(0)}ms  ${(contentMs/wallMs*100).toFixed(1)}%`);
console.log(`  other:   ${(wallMs-attrMs-contentMs).toFixed(0)}ms  ${((wallMs-attrMs-contentMs)/wallMs*100).toFixed(1)}%`);
