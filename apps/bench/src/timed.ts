import { generatePurchases } from "./realworld/data.js";
import { PROFILE } from "@vincle/kita-html/jsx-runtime";
import { render } from "./realworld/vincle-2.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);

// ── Configuration ────────────────────────────────────────────────────
const WARMUP = 200;
const ITERS = 200;
const SAMPLES = 3;

// ── Warmup ───────────────────────────────────────────────────────────
for (let i = 0; i < WARMUP; i++) render(NAME, PURCHASES);
PROFILE.attrMs = 0;
PROFILE.contentMs = 0;

// ── Sampling ─────────────────────────────────────────────────────────
type Sample = { wall: number; attr: number; content: number };
const samples: Sample[] = [];

for (let s = 0; s < SAMPLES; s++) {
  PROFILE.attrMs = 0;
  PROFILE.contentMs = 0;

  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) render(NAME, PURCHASES);
  const wall = performance.now() - t0;

  samples.push({ wall, attr: PROFILE.attrMs, content: PROFILE.contentMs });
}

// ── Stats ────────────────────────────────────────────────────────────
const walls = samples.map(s => s.wall).sort((a, b) => a - b);

const wallMin = walls[0];
const wallMed = walls.length % 2 === 0
  ? (walls[walls.length / 2 - 1] + walls[walls.length / 2]) / 2
  : walls[Math.floor(walls.length / 2)];
const wallMax = walls[walls.length - 1];

const attrMed = samples.map(s => s.attr).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const contentMed = samples.map(s => s.content).sort((a, b) => a - b)[Math.floor(samples.length / 2)];

console.log(`core-2 ×10 (${ITERS} iters × ${SAMPLES} samples):`);
console.log(`  wall:    min=${wallMin.toFixed(0)}ms  med=${wallMed.toFixed(0)}ms  max=${wallMax.toFixed(0)}ms`);
console.log(`  spread:  ${((wallMax - wallMin) / wallMed * 100).toFixed(1)}%`);
console.log(`  attr:    ${attrMed.toFixed(0)}ms  ${(attrMed / wallMed * 100).toFixed(1)}%`);
console.log(`  content: ${contentMed.toFixed(0)}ms  ${(contentMed / wallMed * 100).toFixed(1)}%`);
console.log(`  other:   ${(wallMed - attrMed - contentMed).toFixed(0)}ms  ${((wallMed - attrMed - contentMed) / wallMed * 100).toFixed(1)}%`);
