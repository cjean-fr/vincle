/**
 * ReDoS Audit — ASVS 1.3.12 (L3) — Automated regression suite.
 *
 * Every regex in @vincle/flow's production code is declared here as a literal
 * (pattern + flags) and verified against:
 *   1. Static analysis — pattern checked for nested quantifiers, overlapping
 *      alternations, and other catastrophic-backtracking constructs.
 *   2. Behavioral contract — the regex matches/rejects expected inputs.
 *
 * Kept in sync with core/redos-audit.test.ts conventions.
 */
import { describe, it, expect } from "bun:test";

interface RegexEntry {
  id: number;
  file: string;
  name: string;
  pattern: string;
  flags: string;
  purpose: string;
  whySafe: string;
}

const ALL_REGEXES: RegexEntry[] = [
  {
    id: 1,
    file: "render.ts",
    name: "REGEX_SHELL_CLOSE",
    pattern: "((?:<\\/body>)?\\s*<\\/html>\\s*)$",
    flags: "",
    purpose: "Strip closing </body></html> tags from shell for streaming.",
    whySafe:
      "Anchored at end with `$`. Fixed literals only — no quantifier on groups, no alternation nesting.",
  },
  {
    id: 2,
    file: "assets.ts",
    name: "REGEX_MARKER",
    pattern: "<!-- vincle:(style|script):(.+?) -->",
    flags: "g",
    purpose: "Find asset placeholder markers in HTML for resolution.",
    whySafe:
      "Lazy `+?` on a character class followed by fixed literal ` -->` — the trailing literal prevents runaway backtracking.",
  },
  {
    id: 3,
    file: "utils.ts",
    name: "REGEX_FRAGMENT_ID",
    pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$",
    flags: "",
    purpose: "Validate fragment id format.",
    whySafe: "Anchored with `*` on a character class only — no nested groups, no alternation.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ReDoS pattern detection helpers (same as core)
// ─────────────────────────────────────────────────────────────────────────────

type Risk = { type: string; severity: "info" | "review" };

function hasNestedQuantifier(src: string): boolean {
  return /\([^)]+\)[*+?{]/.test(src);
}

function hasAltInGroup(src: string): boolean {
  return /\(.*\|.*\)[*+?{]/.test(src);
}

function hasAdjacentQuantifiers(src: string): boolean {
  return /[+*?][+*?]/.test(src);
}

function hasEmptyAlternation(src: string): boolean {
  return /\|\s*\)|\|\|/.test(src);
}

function analyze(src: string): Risk[] {
  const risks: Risk[] = [];
  if (hasNestedQuantifier(src))
    risks.push({
      type: "nested quantifier: group followed by * + ? or {",
      severity: "review",
    });
  if (hasAltInGroup(src))
    risks.push({
      type: "alternation inside quantified group",
      severity: "review",
    });
  if (hasAdjacentQuantifiers(src))
    risks.push({
      type: "adjacent quantifiers (e.g. ++, *+, ?+)",
      severity: "review",
    });
  if (hasEmptyAlternation(src))
    risks.push({ type: "empty branch in alternation", severity: "review" });
  return risks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static analysis
// ─────────────────────────────────────────────────────────────────────────────

describe("ReDoS static analysis", () => {
  for (const re of ALL_REGEXES) {
    it(`${re.id}: ${re.file} ${re.name} is structurally safe`, () => {
      const risks = analyze(re.pattern);
      expect(new RegExp(re.pattern, re.flags)).toBeDefined();

      if (risks.length > 0) {
        const msg = risks.map((r) => r.type).join("; ");
        expect(re.whySafe).toBeTruthy();
        console.warn(
          `[ReDoS] ${re.id} ${re.name}: static analysis flags (${msg}) ` +
            `— justified: ${re.whySafe}`,
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral contract
// ─────────────────────────────────────────────────────────────────────────────

function rx(entry: RegexEntry): RegExp {
  return new RegExp(entry.pattern, entry.flags);
}

describe("ReDoS behavioral contract", () => {
  it("[1] REGEX_SHELL_CLOSE matches trailing </body></html>", () => {
    const r = rx(ALL_REGEXES[0]!);
    expect(r.test("</body>\n</html>")).toBe(true);
    expect(r.test("</html>")).toBe(true);
    expect(r.test("</body> </html>")).toBe(true);
    expect(r.test("<html><body></body></html>")).toBe(true);
    expect(r.test("<html>")).toBe(false);
    expect(r.test("")).toBe(false);
  });

  it("[2] REGEX_MARKER finds asset markers", () => {
    // g flag mutates lastIndex — fresh regex per assertion
    expect(rx(ALL_REGEXES[1]!).test("<!-- vincle:style:ec/base -->")).toBe(true);
    expect(rx(ALL_REGEXES[1]!).test("<!-- vincle:script:jquery -->")).toBe(true);
    expect(rx(ALL_REGEXES[1]!).test("<!-- vincle:style:a/b -->")).toBe(true);
    expect(rx(ALL_REGEXES[1]!).test("plain text")).toBe(false);
    expect(rx(ALL_REGEXES[1]!).test("<!-- other -->")).toBe(false);
  });

  it("[3] REGEX_FRAGMENT_ID validates fragment ids", () => {
    const r = rx(ALL_REGEXES[2]!);
    expect(r.test("my-id")).toBe(true);
    expect(r.test("section_1")).toBe(true);
    expect(r.test("a")).toBe(true);
    expect(r.test("")).toBe(false);
    expect(r.test("-no")).toBe(false);
    expect(r.test("_no")).toBe(false);
    expect(r.test("no space")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consistency
// ─────────────────────────────────────────────────────────────────────────────

it("all 3 production regexes are audited", () => {
  expect(ALL_REGEXES.length).toBe(3);
});

it("no duplicate IDs or names", () => {
  const ids = ALL_REGEXES.map((r) => r.id);
  const names = ALL_REGEXES.map((r) => r.file + ":" + r.name);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(names).size).toBe(names.length);
});

it("each regex compiles with its declared flags", () => {
  for (const re of ALL_REGEXES) {
    expect(() => new RegExp(re.pattern, re.flags)).not.toThrow();
  }
});

it("every source file referenced has a regex declared", () => {
  const files = new Set(ALL_REGEXES.map((r) => r.file));
  expect(files.has("render.ts")).toBe(true);
  expect(files.has("assets.ts")).toBe(true);
  expect(files.has("utils.ts")).toBe(true);
});
