import { bench, group, run } from "mitata";
import { buildAttrs } from "../src/attrs.js";

// ── Fixtures ──────────────────────────────────────────────────────────────
// Realistic attribute sets ordered by frequency of use.

// 1. Simple string attrs (class, id, href) — most common
const simpleAttrs = {
  class: "foo bar baz",
  id: "main-content",
  href: "/some/page",
};

// 2. Mixed: string + boolean + style
const mixedAttrs = {
  class: "container",
  id: "app",
  hidden: false,
  disabled: true,
  style: { color: "red", fontSize: "14px" },
  "aria-label": "Main navigation",
  "data-testid": "nav",
};

// 3. Heavy: many attrs, arrays, booleans
const heavyAttrs = {
  class: ["foo", "bar", "baz", "qux"],
  id: "heavy",
  style: { color: "red", fontSize: "14px", fontWeight: "bold", marginTop: "10px" },
  hidden: false,
  disabled: true,
  checked: false,
  required: true,
  href: "https://example.com",
  "aria-label": "Heavy component",
  "data-testid": "heavy",
  tabIndex: 0,
  role: "button",
  rel: "noopener",
  target: "_blank",
};

// ── Bench ─────────────────────────────────────────────────────────────────

const ITERATIONS = 10_000;

const fixtures = [simpleAttrs, mixedAttrs, heavyAttrs];

for (const attrs of fixtures) {
  // warmup
  for (let i = 0; i < 1000; i++) buildAttrs(attrs);

  const label = Object.keys(attrs).length <= 3 ? "simple" : Object.keys(attrs).length <= 8 ? "mixed" : "heavy";
  bench(`buildAttrs ${label}`, () => {
    for (let i = 0; i < ITERATIONS; i++) {
      buildAttrs(attrs);
    }
  });
}

await run();
