export const RUNTIMES = ["bun", "deno", "node"] as const;

export type Runtime = (typeof RUNTIMES)[number];

export interface RuntimeScope {
  Bun?: { version?: string };
  Deno?: { version?: { deno?: string } };
  process?: {
    versions?: {
      bun?: string;
      node?: string;
    };
  };
}

export type Ask = (question: string) => Promise<string>;

export function detectRuntime(
  scope: RuntimeScope = globalThis as unknown as RuntimeScope,
): Runtime | undefined {
  if (scope.Bun?.version || scope.process?.versions?.bun) return "bun";
  if (scope.Deno?.version?.deno) return "deno";
  if (scope.process?.versions?.node) return "node";
  return undefined;
}

export function runtimeLabel(runtime: Runtime): string {
  if (runtime === "node") return "Node.js";
  if (runtime === "bun") return "Bun";
  return "Deno";
}

export function runtimeDevCommand(runtime: Runtime): string {
  if (runtime === "bun") return "bun run dev";
  if (runtime === "deno") return "deno task dev";
  return "npm run dev";
}

export function parseRuntime(value: string, fallback?: Runtime): Runtime | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return fallback;
  if (normalized === "1" || normalized === "bun") return "bun";
  if (normalized === "2" || normalized === "node" || normalized === "nodejs") {
    return "node";
  }
  if (normalized === "3" || normalized === "deno") return "deno";
  return undefined;
}

export function runtimeQuestion(defaultRuntime?: Runtime): string {
  const detected = defaultRuntime ? ` (detected: ${runtimeLabel(defaultRuntime)})` : "";
  return `Choose runtime${detected}: 1) Bun  2) Node.js  3) Deno > `;
}

export async function promptRuntime(
  defaultRuntime: Runtime | undefined,
  ask: Ask,
  onError: (message: string) => void = () => undefined,
): Promise<Runtime> {
  for (;;) {
    const answer = await ask(runtimeQuestion(defaultRuntime));
    const runtime = parseRuntime(answer, defaultRuntime);
    if (runtime) return runtime;
    onError("Choose 1, 2, 3, Bun, Node.js, or Deno.");
  }
}
