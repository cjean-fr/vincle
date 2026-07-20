// ── Benchmark blocks alternés (3 libs) avec cooling pause ──────────

import { generatePurchases } from "./realworld/data.js";
import { render as renderKita } from "./realworld/vincle-2.js";
import { render as renderNext } from "./realworld/vincle-next.js";
import { render as renderPreact } from "./realworld/vincle-preact.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);
const WARMUP = 100;
const BLOCK = 20;
const BLOCKS = 10;
const SAMPLES = 5;

for (let i = 0; i < WARMUP; i++) {
  renderKita(NAME, PURCHASES);
  renderNext(NAME, PURCHASES);
  renderPreact(NAME, PURCHASES);
}

const rKita: number[] = [];
const rNext: number[] = [];
const rPreact: number[] = [];

for (let s = 0; s < SAMPLES; s++) {
  const localKita: number[] = [];
  const localNext: number[] = [];
  const localPreact: number[] = [];

  for (let b = 0; b < BLOCKS; b++) {
    let t = performance.now();
    for (let i = 0; i < BLOCK; i++) renderKita(NAME, PURCHASES);
    localKita.push(performance.now() - t);

    t = performance.now();
    for (let i = 0; i < BLOCK; i++) renderNext(NAME, PURCHASES);
    localNext.push(performance.now() - t);

    t = performance.now();
    for (let i = 0; i < BLOCK; i++) renderPreact(NAME, PURCHASES);
    localPreact.push(performance.now() - t);

    Bun.sleepSync(1500);
  }

  rKita.push(localKita.reduce((a, b) => a + b, 0));
  rNext.push(localNext.reduce((a, b) => a + b, 0));
  rPreact.push(localPreact.reduce((a, b) => a + b, 0));
}

function stats(arr: number[]) {
  const s = arr.slice().sort((a, b) => a - b);
  const min = s[0], max = s[s.length - 1];
  const med = s.length % 2 === 0
    ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : s[Math.floor(s.length / 2)];
  return { min, max, med, spread: ((max - min) / med * 100) };
}

const sKita = stats(rKita);
const sNext = stats(rNext);
const sPreact = stats(rPreact);

console.log(`Benchmark 3-way (${BLOCK} iters × ${BLOCKS} blocks × ${SAMPLES} samples)`);
console.log(`cooling: 1500ms entre chaque block`);
console.log(``);
console.log(`kita-html:`);
console.log(`  wall:    min=${sKita.min.toFixed(0)}ms  med=${sKita.med.toFixed(0)}ms  max=${sKita.max.toFixed(0)}ms`);
console.log(`  spread:  ${sKita.spread.toFixed(1)}%`);
console.log(`core-next:`);
console.log(`  wall:    min=${sNext.min.toFixed(0)}ms  med=${sNext.med.toFixed(0)}ms  max=${sNext.max.toFixed(0)}ms`);
console.log(`  spread:  ${sNext.spread.toFixed(1)}%`);
console.log(`preact:`);
console.log(`  wall:    min=${sPreact.min.toFixed(0)}ms  med=${sPreact.med.toFixed(0)}ms  max=${sPreact.max.toFixed(0)}ms`);
console.log(`  spread:  ${sPreact.spread.toFixed(1)}%`);
console.log(``);
console.log(`ratio (med): core-next/kita  = ${(sNext.med / sKita.med).toFixed(3)}×`);
console.log(`ratio (med): preact/kita     = ${(sPreact.med / sKita.med).toFixed(3)}×`);
console.log(`ratio (med): core-next/preact = ${(sNext.med / sPreact.med).toFixed(3)}×`);
console.log(``);
console.log(`Échantillons kita:    [${rKita.map(v => v.toFixed(0)).join(", ")}]`);
console.log(`Échantillons next:    [${rNext.map(v => v.toFixed(0)).join(", ")}]`);
console.log(`Échantillons preact:  [${rPreact.map(v => v.toFixed(0)).join(", ")}]`);
