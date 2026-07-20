import { $ } from "bun";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const BASE = "/home/christophe/Workspace/vincle/apps/bench/src";

console.log("=== core-2 ===");
await $`bun ${BASE}/timed.ts`.quiet();
await sleep(2000);

console.log("=== core-next ===");
await $`bun ${BASE}/timed-next.ts`.quiet();
await sleep(2000);

console.log("=== @vincle/core ===");
await $`bun ${BASE}/timed-vincle.ts`.quiet();
