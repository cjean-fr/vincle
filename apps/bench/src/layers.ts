/**
 * Micro-benchmarks: isolate each security/overhead layer in @vincle/core
 * to measure its marginal cost vs a stripped-down baseline.
 *
 * Each test compares:
 *   - vincle's actual function
 *   - a minimal 'unsafe' version that does the same work sans security check
 *
 * Run: `bun run src/layers.ts` (from apps/bench)
 */
import { bench, group, run } from "mitata";
import { jsx } from "@vincle/core/jsx-runtime";
import { renderToString, raw } from "@vincle/core";
import {
  escapeContent,
  escapeAttr,
  isSafeScheme,
  isSafeSrcset,
  isValidAttrName,
  isValidTagName,
  sanitize,
} from "../../../packages/core/src/utils/escape.js";
import { createElement as kita } from "@kitajs/html";

// Pre-build kitaJS elements for Layer 7
const kitaNoAttr = kita("div", null, "hello");
const kitaWithAttr = kita(
  "div",
  { class: "foo", "data-testid": "bar" },
  "hello",
);
const kitaUrl = kita("a", { href: "https://example.com" }, "link");
const kitaMany = (() => {
  const children = Array.from({ length: 100 }, (_, i) =>
    kita("span", { class: `c-${i}` }, `item-${i}`),
  );
  return kita("div", null, ...children);
})();

// ---------------------------------------------------------------------------
// Layer 1: RawString allocation
// ---------------------------------------------------------------------------
const LONG_HTML = '<div class="foo"><span>hello world</span></div>'.repeat(100);

group("Layer 1 — RawString allocation", () => {
  bench("plain string", () => {
    let s = "";
    for (let i = 0; i < 1000; i++) s += LONG_HTML;
    return s;
  });
  bench("RawString wrapper", () => {
    let s: any;
    for (let i = 0; i < 1000; i++) s = raw(LONG_HTML);
    return s;
  });
});

// ---------------------------------------------------------------------------
// Layer 2: escapeContent vs no escaping
// ---------------------------------------------------------------------------
const TEXT_SAFE = "hello world, this is some text with no special chars";
const TEXT_UNSAFE = "hello <world> & welcome to \"xss\" test 'here'";

group("Layer 2 — escapeContent", () => {
  bench("no escaping (safe text)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += TEXT_SAFE;
    return s;
  });
  bench("escapeContent (safe text)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += escapeContent(TEXT_SAFE);
    return s;
  });
  bench("escapeContent (unsafe text)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += escapeContent(TEXT_UNSAFE);
    return s;
  });
});

// ---------------------------------------------------------------------------
// Layer 3: escapeAttr vs no escaping
// ---------------------------------------------------------------------------
const ATTR_SAFE = "hello-world-42";
const ATTR_UNSAFE = "hello\"world&<>'test";

group("Layer 3 — escapeAttr", () => {
  bench("no escaping (safe attr)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += ATTR_SAFE;
    return s;
  });
  bench("escapeAttr (safe attr)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += escapeAttr(ATTR_SAFE);
    return s;
  });
  bench("escapeAttr (unsafe attr)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += escapeAttr(ATTR_UNSAFE);
    return s;
  });
});

// ---------------------------------------------------------------------------
// Layer 4: isSafeScheme
// ---------------------------------------------------------------------------
const URL_HTTPS = "https://example.com/path?q=hello&world=42";
const URL_JS = "javascript:alert(1)";
const URL_DATA_GOOD = "data:image/png;base64,iVBORw0KGgo=";
const URL_DATA_BAD = "data:text/html,<script>alert(1)</script>";

group("Layer 4 — isSafeScheme", () => {
  bench("no check (pass-through)", () => {
    const urls = [URL_HTTPS, URL_JS, URL_DATA_GOOD, URL_DATA_BAD];
    let s = "";
    for (let i = 0; i < 5000; i++) s += urls[i & 3];
    return s;
  });
  bench("isSafeScheme (safe https)", () => {
    for (let i = 0; i < 5000; i++) isSafeScheme(URL_HTTPS);
  });
  bench("isSafeScheme (blocked javascript:)", () => {
    for (let i = 0; i < 5000; i++) isSafeScheme(URL_JS);
  });
  bench("isSafeScheme (allowed data:image)", () => {
    for (let i = 0; i < 5000; i++) isSafeScheme(URL_DATA_GOOD);
  });
  bench("isSafeScheme (blocked data:text/html)", () => {
    for (let i = 0; i < 5000; i++) isSafeScheme(URL_DATA_BAD);
  });
});

// ---------------------------------------------------------------------------
// Layer 5: srcset validation
// ---------------------------------------------------------------------------
const SRCSET_SAFE =
  "https://example.com/img.png 1x, https://example.com/img2.jpg 2x";
const SRCSET_UNSAFE = "https://example.com/img.png 1x, javascript:alert(1) 2x";

group("Layer 5 — isSafeSrcset", () => {
  bench("no check (pass-through)", () => {
    let s = "";
    for (let i = 0; i < 5000; i++) s += SRCSET_SAFE;
    return s;
  });
  bench("isSafeSrcset (safe)", () => {
    for (let i = 0; i < 5000; i++) isSafeSrcset(SRCSET_SAFE);
  });
  bench("isSafeSrcset (unsafe)", () => {
    for (let i = 0; i < 5000; i++) isSafeSrcset(SRCSET_UNSAFE);
  });
});

// ---------------------------------------------------------------------------
// Layer 6: isValidAttrName
// ---------------------------------------------------------------------------
const ATTR_NAME_SAFE = "data-testid";
const ATTR_NAME_UNSAFE = '" onclick="alert(1)';

group("Layer 6 — isValidAttrName", () => {
  bench("no check (pass-through)", () => {
    let s = "";
    for (let i = 0; i < 10000; i++) s += ATTR_NAME_SAFE;
    return s;
  });
  bench("isValidAttrName (safe)", () => {
    for (let i = 0; i < 10000; i++) isValidAttrName(ATTR_NAME_SAFE);
  });
  bench("isValidAttrName (unsafe)", () => {
    for (let i = 0; i < 10000; i++) isValidAttrName(ATTR_NAME_UNSAFE);
  });
});

// ---------------------------------------------------------------------------
// Layer 7: full renderToString — stripping layers progressively
// We compare vincle's full pipeline vs a baseline that replicates kitaJS's
// approach (no security checks, no RawString, no VincleNode dispatch).
// ---------------------------------------------------------------------------

// Baseline: kitaJS-style direct string building (no security)
function baselineRender(
  tag: string,
  attrs: Record<string, string | boolean | null | undefined> | null,
  ...children: string[]
): string {
  let attrStr = "";
  if (attrs) {
    for (const key in attrs) {
      const val = attrs[key];
      if (val === null || val === undefined) continue;
      if (typeof val === "boolean") {
        if (val) attrStr += ` ${key}`;
        continue;
      }
      attrStr += ` ${key}="${val}"`;
    }
  }
  const ch = children.join("");
  return `<${tag}${attrStr}>${ch}</${tag}>`;
}

// Simple element
const EL_NO_ATTR = jsx("div", { children: "hello" });
const EL_WITH_ATTR = jsx("div", {
  class: "foo",
  "data-testid": "bar",
  children: "hello",
});
const EL_WITH_URL = jsx("a", { href: "https://example.com", children: "link" });
const EL_WITH_STYLE = jsx("div", {
  style: "color:red;background:blue;",
  children: "x",
});

// 100 children flat
const MANY_CHILDREN = Array.from({ length: 100 }, (_, i) =>
  jsx("span", { class: `c-${i}`, children: `item-${i}` }),
);
const EL_MANY = jsx("div", { children: MANY_CHILDREN });

group("Layer 7 — Full pipeline vs baseline (kitaJS-style)", () => {
  // Baseline: synchronous, no security, direct string building
  bench("BASELINE: simple element", () => {
    return baselineRender("div", null, "hello");
  });
  bench("BASELINE: with attrs", () => {
    return baselineRender(
      "div",
      { class: "foo", "data-testid": "bar" },
      "hello",
    );
  });
  bench("BASELINE: URL attr", () => {
    return baselineRender("a", { href: "https://example.com" }, "link");
  });
  bench("BASELINE: 100 children", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      baselineRender("span", { class: `c-${i}` }, `item-${i}`),
    );
    return baselineRender("div", null, ...items);
  });

  // Vincle: full pipeline
  bench("VINCLE: simple element", async () => {
    await renderToString(EL_NO_ATTR);
  });
  bench("VINCLE: with attrs", async () => {
    await renderToString(EL_WITH_ATTR);
  });
  bench("VINCLE: URL attr", async () => {
    await renderToString(EL_WITH_URL);
  });
  bench("VINCLE: 100 children", async () => {
    await renderToString(EL_MANY);
  });

  bench("KITAJS: simple element", () => kitaNoAttr);
  bench("KITAJS: with attrs", () => kitaWithAttr);
  bench("KITAJS: URL attr", () => kitaUrl);
  bench("KITAJS: 100 children", () => kitaMany);
});

// ---------------------------------------------------------------------------
// Layer 8: the async tax — Promise overhead
// ---------------------------------------------------------------------------
group("Layer 8 — Async overhead", () => {
  // Sync baseline: just return a string
  bench("sync: direct string return", () => {
    return "<div>hello</div>";
  });

  // Vincle sync: even sync trees go through async renderToString
  bench("vincle: sync tree via async renderToString", async () => {
    await renderToString(jsx("div", { children: "hello" }));
  });

  // Promise.resolve microtask cost isolation
  bench("Promise.resolve().then() overhead", async () => {
    await Promise.resolve().then(() => "<div>hello</div>");
  });
  bench("async function overhead", async () => {
    const fn = async () => "<div>hello</div>";
    await fn();
  });
});

await run();
