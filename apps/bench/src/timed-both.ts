// ── Benchmark blocks alternés avec cooling pause ───────────────────
// On alterne par blocks de 20 iters pour que les 2 libs voient
// les mêmes conditions thermiques, ET on peut mesurer individuellement.

import { generatePurchases } from "./realworld/data.js";
import { render as render2 } from "./realworld/vincle-2.js";
import { render as renderNext } from "./realworld/vincle-next.js";

const NAME = "John";
const PURCHASES = generatePurchases(10000);
const WARMUP = 100;
const BLOCK = 20;       // iters par block
const BLOCKS = 10;       // nombre de blocks par lib par sample
const SAMPLES = 5;

for (let i = 0; i < WARMUP; i++) { render2(NAME, PURCHASES); renderNext(NAME, PURCHASES); }

const r2: number[] = [];
const rN: number[] = [];

for (let s = 0; s < SAMPLES; s++) {
  const local2: number[] = [];
  const localN: number[] = [];

  for (let b = 0; b < BLOCKS; b++) {
    // Toujours core-2 en premier dans un sample donné
    // (l'ordre est constant, le cooling pause entre chaque block nivelle la température)
    let t = performance.now();
    for (let i = 0; i < BLOCK; i++) render2(NAME, PURCHASES);
    local2.push(performance.now() - t);

    t = performance.now();
    for (let i = 0; i < BLOCK; i++) renderNext(NAME, PURCHASES);
    localN.push(performance.now() - t);

    // Cooling pause — laisse le CPU redescendre
    Bun.sleepSync(1500);
  }

  // On agrège ce sample
  r2.push(local2.reduce((a, b) => a + b, 0));
  rN.push(localN.reduce((a, b) => a + b, 0));
}

function stats(arr: number[]) {
  const s = arr.slice().sort((a, b) => a - b);
  const min = s[0], max = s[s.length - 1];
  const med = s.length % 2 === 0
    ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : s[Math.floor(s.length / 2)];
  return { min, max, med, spread: ((max - min) / med * 100) };
}

const s2 = stats(r2);
const sN = stats(rN);

console.log(`Benchmark blocks alternés (${BLOCK} iters × ${BLOCKS} blocks × ${SAMPLES} samples)`);
console.log(`cooling: 1500ms entre chaque block`);
console.log(`\ncore-2:`);
console.log(`  wall:    min=${s2.min.toFixed(0)}ms  med=${s2.med.toFixed(0)}ms  max=${s2.max.toFixed(0)}ms`);
console.log(`  spread:  ${s2.spread.toFixed(1)}%`);
console.log(`\ncore-next:`);
  console.log(`  wall:    min=${sN.min.toFixed(0)}ms  med=${sN.med.toFixed(0)}ms  max=${sN.max.toFixed(0)}ms`);
  console.log(`  spread:  ${sN.spread.toFixed(1)}%`);
  console.log(`\nratio (med):  ${(sN.med / s2.med).toFixed(3)}×`);
console.log(`ratio (min):  ${(sN.min / s2.min).toFixed(3)}×`);

// Affiche les valeurs brutes
console.log(`\nÉchantillons core-2:   [${r2.map(v => v.toFixed(0)).join(", ")}]`);
console.log(`Échantillons core-next: [${rN.map(v => v.toFixed(0)).join(", ")}]`);
