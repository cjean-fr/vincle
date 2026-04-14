/**
 * Profil CPU d'un seul cas, une seule implémentation : `bench.js` profilé, c'est
 * un profil de mitata. Les deux moteurs sont exigés avant tout ticket perf.
 *
 * Usage:
 *   node  --conditions=dist --cpu-prof --cpu-prof-name=v8.cpuprofile  src/profile.js vincle realworld
 *   bun   --conditions=dist --cpu-prof                                src/profile.js vincle realworld
 *
 * Args: <impl: vincle|kitajs> <case: realworld|text> [iterations]
 */

// `render` rend déjà du HTML final : le réenvelopper l'échapperait, +28 % et une
// fausse lenteur.
import { NAME, generatePurchases } from "./realworld/data.js";
import { render as realworldKita } from "./realworld/kitajs.js";
import { render as realworldVincle } from "./realworld/vincle.js";

const [, , impl = "vincle", kase = "realworld", iters = "400"] = process.argv;
const N = Number(iters);

const purchases = generatePurchases();

/** @returns {Promise<string> | string} */
function once() {
  if (kase !== "realworld") throw new Error(`unknown case: ${kase}`);
  if (impl === "vincle") return realworldVincle(NAME, purchases);
  if (impl === "kitajs") return realworldKita(NAME, purchases);
  throw new Error(`unknown impl: ${impl}`);
}

// Warm up the JIT before the measured region, so the profile is steady-state
// code rather than the tier-up path.
for (let i = 0; i < 30; i++) await once();

const start = process.hrtime.bigint();
let bytes = 0;
for (let i = 0; i < N; i++) bytes += (await once()).length;
const ms = Number(process.hrtime.bigint() - start) / 1e6;

console.error(
  `${impl}/${kase}: ${N} renders in ${ms.toFixed(0)} ms ` +
    `(${(ms / N).toFixed(3)} ms each, ${(bytes / N / 1024).toFixed(1)} KB out)`,
);
