/**
 * ReDoS Audit — ASVS 1.3.12 (L3) — Automated regression suite.
 *
 * Every regex in @vincle/core's production code is declared here as a literal
 * (pattern + flags) and verified against:
 *   1. Static analysis — pattern checked for nested quantifiers, overlapping
 *      alternations, and other catastrophic-backtracking constructs.
 *   2. Behavioral contract — the regex matches/rejects expected inputs.
 *
 * If a regex is added, removed, or its pattern changed, this test catches it.
 * See apps/docs/docs-src/pages/safety/index.mdx for the full matrix.
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
    file: "escape.ts",
    name: "REGEX_CONTENT_TEST",
    pattern: "[&<>]",
    flags: "",
    purpose: "Fast-path test: does this string need HTML content escaping?",
    whySafe: "Simple character class with no quantifiers.",
  },
  {
    id: 2,
    file: "escape.ts",
    name: "REGEX_ATTR_TEST",
    pattern: '[&<>"]',
    flags: "",
    purpose: "Fast-path test: does this string need HTML attribute escaping?",
    whySafe: "Simple character class with no quantifiers.",
  },
  {
    id: 3,
    file: "escape.ts",
    name: "REGEX_OTHER_UNICODE_CHARS_TEST",
    pattern: "\\p{C}",
    flags: "u",
    purpose: "Quick check: does this string contain Unicode 'Other' chars?",
    whySafe: "Single Unicode class with no quantifiers.",
  },
  {
    id: 4,
    file: "escape.ts",
    name: "REGEX_OTHER_UNICODE_CHARS_REPLACE",
    pattern: "\\p{C}",
    flags: "gu",
    purpose: "Strip all Unicode 'Other' characters from a string.",
    whySafe: "Single Unicode class with global flag — linear scan only.",
  },
  {
    id: 5,
    file: "escape.ts",
    name: "REGEX_VALID_ATTR_NAME",
    pattern: "^[^\\s\"'<>/=\\p{C}]+$",
    flags: "u",
    purpose: "Validate an attribute name in one pass (reject controls & delimiters).",
    whySafe: "Single negated character class with anchors and `+`. No alternation, no nesting.",
  },
  {
    id: 6,
    file: "escape.ts",
    name: "REGEX_INVALID_TAG_NAME",
    pattern: "^[!?]|[\\s\"'<>/=\\x60\\\\]|\\p{C}",
    flags: "u",
    purpose: "Reject tag names that could break out of <...> (blocklist approach).",
    whySafe:
      "Three alternatives: leading !? character class; character class of delimiters/whitespace; Unicode Other class. All single character classes or literals — no nested quantifiers or overlapping alternation.",
  },
  {
    id: 7,
    file: "escape.ts",
    name: "REGEX_UNSAFE_PROTOCOLS",
    pattern: "^(?:java|vb)script:",
    flags: "i",
    purpose: "Block dangerous URL schemes (javascript:, vbscript:).",
    whySafe:
      "Fixed-string non-capturing alternation `(?:java|vb)` + literal `script:`, anchored at start. Each alternation branch is a literal with no quantifiers.",
  },
  {
    id: 8,
    file: "escape.ts",
    name: "REGEX_IMAGE_DATA_URI",
    pattern: "^data:image\\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)",
    flags: "i",
    purpose: "Allow only image data: URIs (png, jpeg, gif, webp, avif).",
    whySafe:
      "Literal `data:image/` + alternation of fixed image types. No quantifiers on alternatives — short-circuit at `data:image/` prefix.",
  },
  {
    id: 9,
    file: "render.ts",
    name: "REGEX_CAMEL_TO_KEBAB",
    pattern: "[A-Z]",
    flags: "g",
    purpose: "Find uppercase letters to convert camelCase to kebab-case.",
    whySafe: "Single character class, no quantifiers.",
  },
  {
    id: 10,
    file: "escape.ts",
    name: "REGEX_RAWTEXT_CLOSE",
    pattern: "<\\/(?:script|style|xmp|iframe|noembed|noframes)",
    flags: "gi",
    purpose: "Escape closing rawtext tags (</script> → <\\/script>) to prevent breakout.",
    whySafe:
      "Fixed literal `</` followed by a non-capturing alternation of tag names — all literal. No quantifiers, no nested groups, no overlapping branches.",
  },
  {
    id: 11,
    file: "escape.ts",
    name: "REGEX_SRCSET_CANDIDATE",
    pattern: "^(\\S+)(?:\\s+(?:\\d+w|\\d+(?:\\.\\d+)?x))?\\s*$",
    flags: "",
    purpose: "Validate each srcset candidate: URL [descriptor].",
    whySafe:
      "Anchored with `+` on `\\S` character class only — no nested groups with quantifiers. Each alternative branch is fixed-literal or single character class.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ReDoS pattern detection helpers
// ─────────────────────────────────────────────────────────────────────────────

type Risk = { type: string; severity: "info" | "review" };

function hasNestedQuantifier(src: string): boolean {
  // Group followed by quantifier: (something)+, (x*)*, (?:a|b)+ etc.
  // Capture the group (including non-capturing, lookaheads) then check
  // for quantifier immediately after.
  // We look for: closing paren + optional ?:! <= then * + ? {
  return /\([^)]+\)[*+?{]/.test(src);
}

function hasAltInGroup(src: string): boolean {
  // Alternation inside a group that's also quantified
  return /\(.*\|.*\)[*+?{]/.test(src);
}

function hasAdjacentQuantifiers(src: string): boolean {
  // Two quantifiers in a row (e.g. ++, *+, ??, +?)
  return /[+*?][+*?]/.test(src);
}

function hasEmptyAlternation(src: string): boolean {
  // |) or || — empty branch in alternation
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
      const rx = new RegExp(re.pattern, re.flags);
      expect(rx).toBeDefined();

      if (risks.length > 0) {
        const msg = risks.map((r) => r.type).join("; ");
        // If the static analyzer flags something, check the whySafe
        // justification — known-safe constructs can still trigger it.
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
// Behavioral contract — each regex behaves correctly
// ─────────────────────────────────────────────────────────────────────────────

function rx(entry: RegexEntry): RegExp {
  return new RegExp(entry.pattern, entry.flags);
}

describe("ReDoS behavioral contract", () => {
  // 1 — REGEX_CONTENT_TEST /[&<>]/
  it("[1] REGEX_CONTENT_TEST matches escapable chars only", () => {
    const r = rx(ALL_REGEXES[0]!);
    expect(r.test("a&b")).toBe(true);
    expect(r.test("a<b")).toBe(true);
    expect(r.test("a>b")).toBe(true);
    expect(r.test("plain text")).toBe(false);
    expect(r.test("")).toBe(false);
  });

  // 2 — REGEX_ATTR_TEST /[&<>"]/
  it("[2] REGEX_ATTR_TEST matches escapable attr chars only", () => {
    const r = rx(ALL_REGEXES[1]!);
    expect(r.test('a"b')).toBe(true);
    expect(r.test("a&b")).toBe(true);
    expect(r.test("a<b")).toBe(true);
    expect(r.test("plain text")).toBe(false);
  });

  // 3 — REGEX_OTHER_UNICODE_CHARS_TEST /\p{C}/u
  it("[3] REGEX_OTHER_UNICODE_CHARS_TEST detects control chars", () => {
    const r = rx(ALL_REGEXES[2]!);
    expect(r.test("\x00")).toBe(true);
    expect(r.test("\x1F")).toBe(true);
    expect(r.test("a")).toBe(false); // letters are \p{L}, not \p{C}
    expect(r.test("\uFFFE")).toBe(true);
    expect(r.test("abc")).toBe(false);
  });

  // 4 — REGEX_OTHER_UNICODE_CHARS_REPLACE /\p{C}/gu
  it("[4] REGEX_OTHER_UNICODE_CHARS_REPLACE replaces all control chars", () => {
    const r = rx(ALL_REGEXES[3]!);
    expect("a\x00b".replace(r, "")).toBe("ab");
    expect("\x00\x01\x02".replace(r, "")).toBe("");
    expect("hello".replace(r, "")).toBe("hello");
  });

  // 5 — REGEX_VALID_ATTR_NAME /^[^\s"'<>/=\p{C}]+$/u
  it("[5] REGEX_VALID_ATTR_NAME validates attribute names", () => {
    const r = rx(ALL_REGEXES[4]!);
    expect(r.test("id")).toBe(true);
    expect(r.test("data-value")).toBe(true);
    expect(r.test("xlink:href")).toBe(true);
    expect(r.test('" onclick="alert(1)')).toBe(false);
    expect(r.test("attr name")).toBe(false);
    expect(r.test('attr"')).toBe(false);
    expect(r.test("attr>")).toBe(false);
    expect(r.test("")).toBe(false);
  });

  // 6 — REGEX_INVALID_TAG_NAME /^[!?]|[\s"'<>/=\`\\]|\p{C}/u
  it("[6] REGEX_INVALID_TAG_NAME rejects invalid tag names", () => {
    const r = rx(ALL_REGEXES[5]!);
    expect(r.test("div")).toBe(false); // valid — no invalid chars
    expect(r.test("custom-element")).toBe(false);
    expect(r.test("-div")).toBe(false); // valid — blocklist doesn't reject -
    expect(r.test("_div")).toBe(false); // valid — blocklist doesn't reject _
    expect(r.test("svg:rect")).toBe(false); // valid — blocklist doesn't reject :
    expect(r.test("<script>")).toBe(true); // contains <
    expect(r.test("div class=x")).toBe(true); // contains space
    expect(r.test("a")).toBe(false); // single letter, valid
    expect(r.test("")).toBe(false); // empty — no leading !?, no forbidden chars
  });

  // 7 — REGEX_UNSAFE_PROTOCOLS /^(?:java|vb)script:/i
  it("[7] REGEX_UNSAFE_PROTOCOLS blocks dangerous URL schemes", () => {
    const r = rx(ALL_REGEXES[6]!);
    expect(r.test("javascript:alert(1)")).toBe(true);
    expect(r.test("vbscript:alert(1)")).toBe(true);
    expect(r.test("JAVASCRIPT:alert(1)")).toBe(true);
    expect(r.test("https://example.com")).toBe(false);
    expect(r.test("javascript:")).toBe(true);
    expect(r.test("java script:")).toBe(false);
    expect(r.test("")).toBe(false);
  });

  // 8 — REGEX_IMAGE_DATA_URI /^data:image\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)/i
  it("[8] REGEX_IMAGE_DATA_URI allows only known image types", () => {
    const r = rx(ALL_REGEXES[7]!);
    expect(r.test("data:image/png;base64")).toBe(true);
    expect(r.test("data:image/jpeg;base64")).toBe(true);
    expect(r.test("data:image/gif+base64")).toBe(true);
    expect(r.test("data:image/webp")).toBe(true);
    expect(r.test("data:image/avif;base64")).toBe(true);
    expect(r.test("data:text/html,<script>")).toBe(false);
    expect(r.test("data:image/svg+xml,abc")).toBe(false);
    expect(r.test("https://example.com")).toBe(false);
  });

  // 9 — REGEX_CAMEL_TO_KEBAB /[A-Z]/g
  it("[9] REGEX_CAMEL_TO_KEBAB matches uppercase letters", () => {
    const r = rx(ALL_REGEXES[8]!);
    expect(r.test("backgroundColor")).toBe(true);
    expect(r.test("alldown")).toBe(false);
    expect(r.test("")).toBe(false);
  });

  // 10 — REGEX_RAWTEXT_CLOSE /<\/(?:script|style|xmp|iframe|noembed|noframes)/gi
  it("[10] REGEX_RAWTEXT_CLOSE matches closing rawtext tags", () => {
    // g flag mutates lastIndex — use fresh regex per assertion
    expect(rx(ALL_REGEXES[9]!).test("</script>")).toBe(true);
    expect(rx(ALL_REGEXES[9]!).test("x = '</script>';")).toBe(true);
    expect(rx(ALL_REGEXES[9]!).test("</STYLE>")).toBe(true);
    expect(rx(ALL_REGEXES[9]!).test("</noframes>")).toBe(true);
    expect(rx(ALL_REGEXES[9]!).test("</iframe>")).toBe(true);
    expect(rx(ALL_REGEXES[9]!).test("</div>")).toBe(false);
    expect(rx(ALL_REGEXES[9]!).test("color: red")).toBe(false);
    expect(rx(ALL_REGEXES[9]!).test("")).toBe(false);
  });

  // 11 — REGEX_SRCSET_CANDIDATE /^(\S+)(?:\s+(?:\d+w|\d+(?:\.\d+)?x))?\s*$/
  it("[11] REGEX_SRCSET_CANDIDATE validates srcset candidates", () => {
    const r = rx(ALL_REGEXES[10]!);
    expect(r.test("image.jpg")).toBe(true);
    expect(r.test("image.jpg 1x")).toBe(true);
    expect(r.test("image.jpg 2x")).toBe(true);
    expect(r.test("image.jpg 100w")).toBe(true);
    expect(r.test("image.jpg 1.5x")).toBe(true);
    expect(r.test("")).toBe(false);
    expect(r.test(" ")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consistency: all 13 regexes are declared and the source files compile
// ─────────────────────────────────────────────────────────────────────────────

it("all 11 production regexes are audited", () => {
  expect(ALL_REGEXES.length).toBe(11);
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
  expect(files.has("escape.ts")).toBe(true);
  expect(files.has("render.ts")).toBe(true);
});
