/**
 * The skill is documentation an LLM reads *before* writing code, so an example
 * that no longer compiles is not a typo — it is a wrong answer, generated at
 * scale, in every project that installs this package. Nothing executed those
 * examples: a `withScope(fn, { seed: snapshot() })` shipped in it for months,
 * and it throws on the first run.
 *
 * Every fenced `ts` / `tsx` block in `SKILL.md` is therefore extracted and
 * type-checked against this package's own sources. A block that is deliberately
 * wrong — a `❌` example, a config fragment — opts out with an HTML comment on
 * the line before its fence:
 *
 *     <!-- skip-typecheck -->
 *     ```tsx
 *
 * Free identifiers an example leans on (`fetchUser`, `HomePage`, …) are
 * declared in `SKILL_GLOBALS` below. A new example using a new name fails here,
 * loudly, instead of in someone's editor.
 */
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_ROOT = import.meta.dir;
const SKILL = join(PACKAGE_ROOT, "skills/core/SKILL.md");
const OUT = join(PACKAGE_ROOT, "tmp/skill-check");

/** ```lang … ``` — `before` is everything up to the fence, for the opt-out scan. */
const RE_BLOCK = /```(ts|tsx)\n([\s\S]*?)\n```/g;
// `<!-- skip-typecheck -->`, optionally carrying its reason: `… -->` is not
// part of the match, so `<!-- skip-typecheck: on purpose -->` opts out too.
const SKIP = "<!-- skip-typecheck";

interface Block {
  index: number;
  lang: string;
  code: string;
}

/** The last non-empty line before `at`, where the opt-out marker lives. */
function lineBefore(markdown: string, at: number): string {
  const lines = markdown.slice(0, at).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line !== "") return line;
  }
  return "";
}

function extractBlocks(markdown: string): { checked: Block[]; skipped: number } {
  const checked: Block[] = [];
  let skipped = 0;
  let index = 0;
  for (const m of markdown.matchAll(RE_BLOCK)) {
    index++;
    const [, lang = "", code = ""] = m;
    if (lineBefore(markdown, m.index).startsWith(SKIP)) {
      skipped++;
      continue;
    }
    checked.push({ index, lang, code });
  }
  return { checked, skipped };
}

// What the examples borrow from the reader's own application. Types are as loose
// as the example needs — this pins that the *vincle* API is used correctly, not
// that a fictional `fetchUser` is well designed.
const SKILL_GLOBALS = `
// Relative to the generated directory, not the package root: an unresolved
// import here would silently make every declaration below \`any\`, and the check
// would pass by checking nothing.
import type { Renderable } from "../../src/types.js";
import type * as Vincle from "../../index.js";

declare global {
  // The real signatures, so an example calling one wrongly fails here. An
  // example is free to import them instead; the import simply shadows these.
  const renderToString: typeof Vincle.renderToString;
  const raw: typeof Vincle.raw;
  const context: typeof Vincle.context;
  const setContext: typeof Vincle.setContext;
  const useContext: typeof Vincle.useContext;
  const withScope: typeof Vincle.withScope;
  const snapshot: typeof Vincle.snapshot;

  const fetchUser: (id: string) => Promise<{ name: string }>;
  const fetchPosts: (id: string) => Promise<unknown[]>;
  const fetchData: () => Promise<unknown>;
  const AsyncComponent: () => Renderable; // Renderable already covers the promise
  const HomePage: () => Renderable;
  const AboutPage: () => Renderable;
  const Content: (props: { data: unknown }) => Renderable;
  const Loading: () => Renderable;
  const App: () => Renderable;
  const Header: () => Renderable;
  const title: string;
  const code: string;
  const url: string;
  const sanitizedHtml: string;
  const user: { name: string };
  // Declared in one example and used in the next: the blocks are separate
  // files here, but a reader's project is one program.
  const AuthContext: Vincle.ContextKey<{ user: string; locale: string }>;
  const ThemeContext: Vincle.ContextKey<{ dark: boolean }>;
  const useState: <T>(initial: T) => [T, (next: T) => void];
  const useEffect: (fn: () => void, deps: unknown[]) => void;
}
`;

const TSCONFIG = {
  extends: "../../tsconfig.json",
  compilerOptions: {
    noEmit: true,
    // A snippet declares what it is illustrating, used or not. That is prose,
    // not dead code — the rest of the package's strictness still applies.
    noUnusedLocals: false,
    noUnusedParameters: false,
    // The package root: these files live under it and reach back into `src/`.
    rootDir: "../..",
    // The examples are written as a reader writes them: `@vincle/core`, not a
    // relative path. The package tsconfig already maps it to `index.ts`.
    paths: { "@vincle/core": ["../../index.ts"], "@vincle/core/*": ["../../src/*.ts"] },
    jsxImportSource: "../../src",
  },
  include: ["./*.tsx", "./*.ts"],
  // The package tsconfig excludes `tmp/`; inherited, that path resolves back
  // onto this very directory and leaves tsc with no inputs at all.
  exclude: [],
};

describe("SKILL.md — every example compiles", () => {
  it("type-checks the fenced ts/tsx blocks against this package", () => {
    const markdown = readFileSync(SKILL, "utf8");
    const { checked, skipped } = extractBlocks(markdown);

    // A regex that stops matching is the silent failure this test would have:
    // it would pass by checking nothing at all.
    expect(checked.length).toBeGreaterThanOrEqual(8);

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "globals.d.ts"), SKILL_GLOBALS);
    writeFileSync(join(OUT, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2));
    for (const { index, lang, code } of checked) {
      // `export {}` forces module scope, which is what top-level `await` needs
      // and what keeps two blocks declaring `html` from colliding.
      writeFileSync(
        join(OUT, `block-${index}.${lang === "tsx" ? "tsx" : "ts"}`),
        `${code}\nexport {};\n`,
      );
    }

    const tsc = spawnSync(join(PACKAGE_ROOT, "../../node_modules/.bin/tsc"), ["-p", OUT], {
      encoding: "utf8",
    });
    const report = `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`.trim();

    if (tsc.status !== 0) {
      const numbered = checked
        .map(({ index, code }) => `── block-${index} ──\n${code}`)
        .join("\n\n");
      throw new Error(
        `SKILL.md has ${checked.length} checked example(s) (${skipped} opted out) and tsc refused:\n\n` +
          `${report}\n\n${numbered}`,
      );
    }
    rmSync(OUT, { recursive: true, force: true });
  }, 60_000);
});
