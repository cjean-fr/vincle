export interface Host {
  args: string[];
  cwd: string;
  stderr: (message: string) => void;
  stdout: (message: string) => void;
  isInteractive: () => boolean;
  ask: (question: string) => Promise<string>;
}

interface DenoIO {
  isTerminal?: () => boolean;
  readable?: unknown;
  read?: (buffer: Uint8Array) => Promise<number | null>;
  writable?: unknown;
  writeSync?: (bytes: Uint8Array) => number;
}

interface RuntimeGlobals {
  Deno?: {
    args?: readonly string[];
    cwd?: () => string;
    stderr?: DenoIO;
    stdin?: DenoIO;
    stdout?: DenoIO;
  };
  process?: {
    argv?: string[];
    cwd?: () => string;
    stderr?: { write: (message: string) => void };
    stdin?: { isTTY?: boolean };
    stdout?: { isTTY?: boolean; write: (message: string) => void };
  };
}

function getGlobals(): RuntimeGlobals {
  return globalThis as unknown as RuntimeGlobals;
}

function writeDeno(stream: DenoIO | undefined, message: string): void {
  stream?.writeSync?.(new TextEncoder().encode(message));
}

async function askDeno(
  deno: NonNullable<RuntimeGlobals["Deno"]>,
  question: string,
): Promise<string> {
  const input = deno.stdin;
  const output = deno.stdout;
  if (!input?.read || !output?.writeSync) return "";

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  output.writeSync(encoder.encode(question));
  const buffer = new Uint8Array(4096);
  let line = "";

  for (;;) {
    const count = await input.read(buffer);
    if (count === null) return line;
    line += decoder.decode(buffer.subarray(0, count), { stream: true });
    const newline = line.indexOf("\n");
    if (newline >= 0) return line.slice(0, newline).replace(/\r$/, "");
  }
}

export function getHost(): Host {
  const globals = getGlobals();

  if (globals.Deno) {
    const deno = globals.Deno;
    const args = deno.args ? [...deno.args] : [];
    const cwd = deno.cwd?.() ?? ".";

    return {
      args,
      cwd,
      stderr: (message) => writeDeno(deno.stderr, message),
      stdout: (message) => writeDeno(deno.stdout, message),
      isInteractive: () =>
        deno.stdin?.isTerminal?.() === true && deno.stdout?.isTerminal?.() === true,
      ask: (question) => askDeno(deno, question),
    };
  }

  const process = globals.process;
  const args = process?.argv?.slice(2) ?? [];
  const cwd = process?.cwd?.() ?? ".";

  return {
    args,
    cwd,
    stderr: (message) => process?.stderr?.write(message),
    stdout: (message) => process?.stdout?.write(message),
    isInteractive: () => process?.stdin?.isTTY === true && process?.stdout?.isTTY === true,
    ask: async (question) => {
      if (!process?.stdin || !process.stdout) return "";
      const { createInterface } = await import("node:readline/promises");
      const readline = createInterface({
        input: process.stdin as unknown as NodeJS.ReadableStream,
        output: process.stdout as unknown as NodeJS.WritableStream,
      });
      try {
        return await readline.question(question);
      } finally {
        readline.close();
      }
    },
  };
}
