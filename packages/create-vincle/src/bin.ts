import { main } from "./cli";

const exitCode = await main();
const globals = globalThis as unknown as {
  Deno?: { exit?: (code: number) => void };
  process?: { exitCode?: number };
};

if (globals.Deno) {
  globals.Deno.exit?.(exitCode);
} else if (globals.process) {
  globals.process.exitCode = exitCode;
}
