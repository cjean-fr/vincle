import { generatePurchases } from "./realworld/data.js";
import { render } from "./realworld/vincle.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);

const WARMUP = 200;
const ITERS = 200;
const SAMPLES = 3;

// Warmup
for (let i = 0; i < WARMUP; i++) await render(NAME, PURCHASES);

// Sampling
const samples: number[] = [];

for (let s = 0; s < SAMPLES; s++) {
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) await render(NAME, PURCHASES);
  samples.push(performance.now() - t0);
}

const sorted = samples.slice().sort((a, b) => a - b);
const wallMin = sorted[0];
const wallMed = sorted.length % 2 === 0
  ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  : sorted[Math.floor(sorted.length / 2)];
const wallMax = sorted[sorted.length - 1];

console.log(`@vincle/core ×10 (${ITERS} iters × ${SAMPLES} samples):`);
console.log(`  wall:    min=${wallMin.toFixed(0)}ms  med=${wallMed.toFixed(0)}ms  max=${wallMax.toFixed(0)}ms`);
console.log(`  spread:  ${((wallMax - wallMin) / wallMed * 100).toFixed(1)}%`);
