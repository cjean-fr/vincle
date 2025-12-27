/**
 * ReDoS audit — ASVS 1.3.12 (L3).
 *
 * Every regex in `@vincle/flow`'s production code is declared here with its
 * pattern, its purpose, and why it cannot backtrack catastrophically. Each
 * declaration is checked three ways:
 *
 *   1. **Against the source.** The production files are parsed and every regex
 *      literal found has to match a declaration — and every declaration has to
 *      match a literal. Adding, removing or editing a regex fails this test.
 *   2. **Statically.** The pattern is scanned for the constructs that make
 *      backtracking blow up. Nothing here may trip the analyzer.
 *   3. **Behaviourally.** The declared matches and rejections must hold.
 *
 * Same mechanism and same detectors as `packages/core/redos-audit.test.ts`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSync } from "oxc-parser";

/**
 * Package root, derived from this file. The scan reads the sources next to
 * it — they don't move depending on which directory `bun test` is invoked from.
 */
const PACKAGE_ROOT = dirname(import.meta.dir);

type Risk = string;

interface RegexEntry {
  /** Path relative to the package root, as the source scan reports it. */
  file: string;
  /** The binding it is attached to — how a reader finds it. */
  name: string;
  pattern: string;
  flags: string;
  purpose: string;
  whySafe: string;
  matches?: string[];
  rejects?: string[];
}

const AUDITED: RegexEntry[] = [
  {
    file: "src/utils.ts",
    name: "REGEX_FRAGMENT_ID",
    pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$",
    flags: "",
    purpose: "Validate a fragment id before it reaches an adapter's wire format.",
    whySafe: "Fully anchored, one `*` on a character class, no groups and no alternation.",
    matches: ["my-id", "section_1", "a"],
    rejects: ["", "-no", "_no", "no space", "1leading"],
  },
  {
    file: "src/utils.ts",
    name: "closingHead",
    pattern: "<\\/head\\s*>",
    flags: "i",
    purpose: "Find where to insert into an existing <head> (injectIntoHead, placement 1).",
    whySafe: "One `\\s*` between two fixed literals — the trailing `>` gives it a single exit.",
    matches: ["<head></head>", "<HEAD>\n</HEAD >"],
    rejects: ["<head>", "</header>"],
  },
  {
    file: "src/utils.ts",
    name: "htmlTag",
    pattern: "<html\\b[^>]*>",
    flags: "i",
    purpose: "Open a <head> right after <html …>, wherever it sits (injectIntoHead, placement 2).",
    whySafe:
      "`[^>]*` is a negated class terminated by the very character it excludes — it cannot backtrack " +
      "past its own terminator.",
    matches: ["<html>", '<html lang="en">', "<HTML DATA-X>"],
    rejects: ["<htmlx>", "<html"],
  },
  {
    file: "src/utils.ts",
    name: "doctype",
    pattern: "^\\s*<!doctype\\b[^>]*>",
    flags: "i",
    purpose:
      "Keep a leading doctype first when the shell has no <html> (injectIntoHead, placement 3). " +
      "Nothing may precede a doctype — markup before it puts the browser in quirks mode.",
    whySafe: "Anchored at the start; `\\s*` and `[^>]*` are separated by a fixed literal.",
    matches: ["<!doctype html>", "  <!DOCTYPE html>", '\n<!doctype html SYSTEM "x">'],
    rejects: ["<html><!doctype html>", "<!doctypehtml>"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. The inventory is derived from the source, not from memory
// ─────────────────────────────────────────────────────────────────────────────

interface FoundRegex {
  file: string;
  name: string;
  pattern: string;
  flags: string;
}

/**
 * Under Stryker every source carries its mutants as literals, so there is no
 * pristine source to compare the inventory against. The comparison is skipped
 * rather than made to fail on the mutator's own scaffolding; the static and
 * behavioural axes still run, and those are the ones mutants should challenge.
 */
const INSTRUMENTED_MARKER = "stryMutAct_";

function scanSources(): {
  literals: FoundRegex[];
  constructorSites: string[];
  instrumented: boolean;
} {
  const files = [...new Bun.Glob("src/**/*.{ts,tsx}").scanSync(PACKAGE_ROOT)]
    .filter((f) => !f.includes(".test."))
    .toSorted();

  const literals: FoundRegex[] = [];
  const constructorSites: string[] = [];
  let instrumented = false;

  for (const file of files) {
    const text = readFileSync(join(PACKAGE_ROOT, file), "utf8");
    if (text.includes(INSTRUMENTED_MARKER)) instrumented = true;
    const ast = parseSync(file, text);
    expect(ast.errors).toEqual([]);

    const walk = (node: unknown, boundTo: string | undefined): void => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, boundTo);
        return;
      }
      const n = node as Record<string, any>;
      const name = n["type"] === "VariableDeclarator" ? n["id"]?.name : boundTo;
      if (n["type"] === "Literal" && n["regex"]) {
        literals.push({
          file,
          name: name ?? "<anonymous>",
          pattern: n["regex"].pattern,
          flags: n["regex"].flags,
        });
      }
      if (n["type"] === "NewExpression" && n["callee"]?.name === "RegExp") {
        constructorSites.push(file);
      }
      for (const key in n) {
        if (key !== "type") walk(n[key], name);
      }
    };
    walk(ast.program, undefined);
  }

  return { literals, constructorSites, instrumented };
}

const identify = (r: { file: string; pattern: string; flags: string }): string =>
  `${r.file} /${r.pattern}/${r.flags}`;

describe("ReDoS inventory is derived from the source, not from memory", () => {
  const { literals, constructorSites, instrumented } = scanSources();
  const onPristineSource = instrumented ? it.skip : it;

  onPristineSource("every regex literal in production code is audited", () => {
    const declared = new Set(AUDITED.map(identify));
    const undeclared = literals.filter((r) => !declared.has(identify(r)));
    expect(
      undeclared.map((r) => `${r.name} at ${identify(r)}`),
      "a new or edited regex must be declared in AUDITED, with why it is safe",
    ).toEqual([]);
  });

  onPristineSource("every audited entry still exists in the source", () => {
    const found = new Set(literals.map(identify));
    const stale = AUDITED.filter((r) => !found.has(identify(r)));
    expect(
      stale.map((r) => `${r.name} at ${identify(r)}`),
      "remove entries that no longer exist — this is what REGEX_MARKER outlived",
    ).toEqual([]);
  });

  onPristineSource("names match too, so the entry points at the right binding", () => {
    const byId = new Map(literals.map((r) => [identify(r), r.name]));
    for (const entry of AUDITED) {
      expect(byId.get(identify(entry))).toBe(entry.name);
    }
  });

  onPristineSource("no regex is built at runtime", () => {
    // `flow` has no dynamic pattern. If one appears it needs its own audit axis,
    // the way `core` treats its per-rawtext-tag constructors.
    expect(constructorSites).toEqual([]);
  });

  it("no duplicate declarations", () => {
    const ids = AUDITED.map(identify);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Static analysis — the constructs that make backtracking explode
// ─────────────────────────────────────────────────────────────────────────────

/** A group followed by a quantifier: `(x)+`, `(?:a|b)*`, … */
const hasQuantifiedGroup = (src: string): boolean => /\([^)]+\)[*+?{]/.test(src);
/** Alternation inside a quantified group — the classic `(a|a)*` shape. */
const hasAltInQuantifiedGroup = (src: string): boolean => /\(.*\|.*\)[*+?{]/.test(src);
/** Two quantifiers in a row, e.g. `++`. (`+?` is lazy, not nested.) */
const hasAdjacentQuantifiers = (src: string): boolean => /[+*?][+*?]/.test(src);
/** An empty branch: `(a|)`, `a||b`. */
const hasEmptyAlternation = (src: string): boolean => /\|\s*\)|\|\|/.test(src);

function analyze(src: string): Risk[] {
  const risks: Risk[] = [];
  if (hasQuantifiedGroup(src)) risks.push("quantified group");
  if (hasAltInQuantifiedGroup(src)) risks.push("alternation inside a quantified group");
  if (hasAdjacentQuantifiers(src)) risks.push("adjacent quantifiers");
  if (hasEmptyAlternation(src)) risks.push("empty branch in alternation");
  return risks;
}

describe("ReDoS static analysis", () => {
  it("the analyzer flags the shapes it is meant to flag", () => {
    // A detector nobody has seen fire is a detector nobody can trust.
    expect(analyze("(a+)+b")).toContain("quantified group");
    expect(analyze("(a|a)*b")).toContain("alternation inside a quantified group");
    expect(analyze("a++")).toContain("adjacent quantifiers");
    expect(analyze("(a|)b")).toContain("empty branch in alternation");
    expect(analyze("[&<>]")).toEqual([]);
  });

  for (const entry of AUDITED) {
    it(`${entry.name} is structurally safe`, () => {
      expect(() => new RegExp(entry.pattern, entry.flags)).not.toThrow();
      const risks = analyze(entry.pattern);
      expect(risks, `flagged (${risks.join("; ")}) — justification: ${entry.whySafe}`).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Behavioural contract
// ─────────────────────────────────────────────────────────────────────────────

describe("ReDoS behavioural contract", () => {
  for (const entry of AUDITED) {
    it(`${entry.name} matches and rejects what it declares`, () => {
      for (const input of entry.matches ?? []) {
        // `g`/`y` would carry lastIndex between assertions — build per input.
        expect(
          new RegExp(entry.pattern, entry.flags).test(input),
          `should match ${JSON.stringify(input)}`,
        ).toBe(true);
      }
      for (const input of entry.rejects ?? []) {
        expect(
          new RegExp(entry.pattern, entry.flags).test(input),
          `should reject ${JSON.stringify(input)}`,
        ).toBe(false);
      }
    });
  }
});
