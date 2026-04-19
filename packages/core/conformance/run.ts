/**
 * Conformance CLI entry point — Bun, Node and Deno.
 *
 * Exits 1 as soon as one case fails: that's what CI reads. workerd goes
 * through `worker.ts` instead, having neither `process` nor an exit code.
 */
import { report, runConformance } from "./suite.ts";

const result = await runConformance();
console.log(report(result));

if (result.failures.length > 0) {
  const g = globalThis as Record<string, any>;
  const exit = g["process"]?.exit ?? g["Deno"]?.exit;
  if (exit) exit(1);
  else throw new Error(`[conformance] ${result.failures.length} failure(s) on ${result.runtime}`);
}
