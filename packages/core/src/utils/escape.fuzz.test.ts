// Property-based ("fuzz") security tests. Where escape.test.ts checks known
// payloads, this file asserts the *invariants* those payloads are examples of:
// properties that must hold for EVERY possible input. fast-check generates
// thousands of adversarial strings (control chars, astral codepoints, partial
// entities, scheme look-alikes) and shrinks any failure to a minimal repro.
import { renderToString } from "../index.js";
import { jsx } from "../jsx-runtime.js";
import {
  escapeContent,
  escapeAttr,
  isSafeScheme,
  isSafeSrcset,
  isValidAttrName,
} from "./escape.js";
import { describe, it } from "bun:test";
import fc from "fast-check";

// Reverse the escaping. The decode regex matches the exact tokens escape*
// inserts, left-to-right and non-overlapping — so it is a precise inverse.
const decodeContent = (s: string): string =>
  s.replace(
    /&(amp|lt|gt);/g,
    (_m, e: string) => ({ amp: "&", lt: "<", gt: ">" })[e]!,
  );
const decodeAttr = (s: string): string =>
  s.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_m, e: string) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]!,
  );

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("escape invariants (property-based)", () => {
  describe("escapeContent", () => {
    it("never leaves a raw < or > in the output", () => {
      fc.assert(
        fc.property(fc.fullUnicodeString(), (s) => {
          const out = escapeContent(s);
          return !out.includes("<") && !out.includes(">");
        }),
        { numRuns: 2000 },
      );
    });

    it("is a lossless, reversible encoding (no corruption, no under-escaping)", () => {
      fc.assert(
        fc.property(fc.fullUnicodeString(), (s) => {
          return decodeContent(escapeContent(s)) === s;
        }),
        { numRuns: 2000 },
      );
    });
  });

  describe("escapeAttr", () => {
    it('never leaves a raw < > or " that could break out of a quoted value', () => {
      fc.assert(
        fc.property(fc.fullUnicodeString(), (s) => {
          const out = escapeAttr(s);
          return !out.includes("<") && !out.includes(">") && !out.includes('"');
        }),
        { numRuns: 2000 },
      );
    });

    it("is a lossless, reversible encoding", () => {
      fc.assert(
        fc.property(fc.fullUnicodeString(), (s) => {
          return decodeAttr(escapeAttr(s)) === s;
        }),
        { numRuns: 2000 },
      );
    });
  });

  describe("isValidAttrName", () => {
    it("a name it accepts can never contain a tag-structural or control char", () => {
      // If these chars could appear in a "valid" name, an attacker could close
      // the tag or open a new attribute: <div NAME="x"> would break out.
      fc.assert(
        fc.property(fc.fullUnicodeString(), (name) => {
          if (!isValidAttrName(name)) return true; // only valid names must be safe
          return !/[\s"'<>/=]/.test(name) && !/\p{C}/u.test(name);
        }),
        { numRuns: 2000 },
      );
    });
  });
});

describe("renders cannot be broken out of (property-based)", () => {
  // The crown-jewel anti-XSS invariant: an attacker controls BOTH a text child
  // and an attribute value, yet the output's structural angle-bracket count is
  // constant. The user string can never introduce a new tag.
  it("a user-controlled child + attribute never adds an angle bracket", async () => {
    await fc.assert(
      fc.asyncProperty(fc.fullUnicodeString(), async (s) => {
        const out = await renderToString(
          jsx("div", { "data-x": s, children: s }),
        );
        // Exactly: "<div" + ">" + "</div" + ">"  ->  two of each, always.
        return count(out, "<") === 2 && count(out, ">") === 2;
      }),
      { numRuns: 400 },
    );
  });

  it("a user-controlled href never adds an angle bracket either", async () => {
    await fc.assert(
      fc.asyncProperty(fc.fullUnicodeString(), async (s) => {
        const out = await renderToString(jsx("a", { href: s, children: "x" }));
        return count(out, "<") === 2 && count(out, ">") === 2;
      }),
      { numRuns: 400 },
    );
  });
});

describe("URL safety invariants (property-based)", () => {
  // All \p{C} (controls + format chars), so sanitize() strips every one. Mixing
  // these into a scheme must NOT let it slip past the check.
  const CONTROL_POOL = [
    0x00, // NUL
    0x09, // TAB
    0x0a, // LF
    0x0d, // CR
    0x0b, // VT
    0x0c, // FF
    0x200b, // zero-width space
    0x200e, // left-to-right mark
    0xfeff, // BOM / zero-width no-break space
  ].map((c) => String.fromCharCode(c));
  const obfuscators = fc.stringOf(fc.constantFrom(...CONTROL_POOL));
  const leadingWs = fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"));

  // Interleave control chars between every character of a dangerous scheme,
  // randomize case, and prepend whitespace — must STILL be blocked.
  const dangerousUrl = (scheme: string) =>
    fc
      .tuple(
        leadingWs,
        fc.array(obfuscators, {
          minLength: scheme.length + 1,
          maxLength: scheme.length + 1,
        }),
        fc.boolean(),
      )
      .map(([ws, noise, upper]) => {
        const s = upper ? scheme.toUpperCase() : scheme;
        let url = ws;
        for (let i = 0; i < s.length; i++) url += noise[i]! + s[i]!;
        return url + noise[s.length]! + "alert(1)";
      });

  it("blocks javascript: under arbitrary control-char/whitespace obfuscation", () => {
    fc.assert(
      fc.property(
        dangerousUrl("javascript:"),
        (url) => isSafeScheme(url) === false,
      ),
      { numRuns: 1000 },
    );
  });

  it("blocks vbscript: under arbitrary obfuscation", () => {
    fc.assert(
      fc.property(
        dangerousUrl("vbscript:"),
        (url) => isSafeScheme(url) === false,
      ),
      { numRuns: 1000 },
    );
  });

  it("blocks non-image data: URIs under arbitrary obfuscation", () => {
    fc.assert(
      fc.property(
        dangerousUrl("data:text/html,"),
        (url) => isSafeScheme(url) === false,
      ),
      { numRuns: 1000 },
    );
  });

  it("never blocks a clearly-safe URL", () => {
    const safePrefix = fc.constantFrom(
      "https://",
      "http://",
      "/",
      "./",
      "../",
      "#",
      "mailto:",
      "tel:",
      "",
    );
    // Path/query chars excluding control chars and the literal ":" that could
    // forge a new scheme at the front.
    const tail = fc
      .fullUnicodeString()
      .filter((s) => !/\p{C}/u.test(s) && !s.includes(":"));
    fc.assert(
      fc.property(safePrefix, tail, (p, t) => isSafeScheme(p + t) === true),
      { numRuns: 1000 },
    );
  });

  it("srcset is blocked if ANY candidate uses a dangerous scheme", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant("image.png 1x"),
            fc.constant("photo.jpg 2x"),
            dangerousUrl("javascript:").map((u) => `${u} 1x`),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        dangerousUrl("javascript:"),
        (candidates, poison) => {
          // Force at least one poisoned candidate into the list.
          const list = [...candidates, `${poison} 2x`].join(", ");
          return isSafeSrcset(list) === false;
        },
      ),
      { numRuns: 1000 },
    );
  });
});
