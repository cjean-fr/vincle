/**
 * Test réel: Bun.escapeHTML vs JS escape.
 */
const TEXT = '<script>alert("xss")</script> &amp; <b>hello world</b> with some > chars';
const LONGTEXT = TEXT.repeat(100);
const N = 10000;

const RE = /[&<>]/;
function jsEscape(str: string): string {
  if (!RE.test(str)) return str;
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; }
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; }
    else if (c === 62) { out += str.slice(start, i) + "&gt;";   start = i + 1; }
  }
  return start === 0 ? str : out + str.slice(start);
}

function time(label: string, fn: (s: string) => string, input: string) {
  // warmup
  for (let i = 0; i < 100; i++) fn(input);
  const start = performance.now();
  for (let i = 0; i < N; i++) fn(input);
  const total = performance.now() - start;
  const perIter = (total / N) * 1000;
  console.log(`  ${label.padEnd(18)} ${perIter.toFixed(3)} µs/iter  (${total.toFixed(1)}ms total)`);
}

console.log("=== Short text (50 chars, has <>&) ===");
time("JS loop", jsEscape, TEXT);
time("Bun.escapeHTML", Bun.escapeHTML, TEXT);

console.log("\n=== Long text (5k chars, many special) ===");
time("JS loop", jsEscape, LONGTEXT);
time("Bun.escapeHTML", Bun.escapeHTML, LONGTEXT);

console.log("\n=== Safe text (no special, 55 chars) ===");
const SAFE = "lorem ipsum dolor sit amet consectetur adipiscing elit";
time("JS loop", jsEscape, SAFE);
time("Bun.escapeHTML", Bun.escapeHTML, SAFE);

console.log("\n=== Very long safe (55k chars, no special) ===");
const LONGSAFE = SAFE.repeat(1000);
time("JS loop", jsEscape, LONGSAFE);
time("Bun.escapeHTML", Bun.escapeHTML, LONGSAFE);

// ─── Attribute escape ──────────────────────────────────────────────────

function jsEscapeAttr(str: string): string {
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; }
    else if (c === 34) { out += str.slice(start, i) + "&quot;"; start = i + 1; }
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; }
  }
  return start === 0 ? str : out + str.slice(start);
}

const ATTR_TEXT = 'hello "world" & some <stuff>';
console.log("\n=== Attribute escape ===");
time("JS loop attr", jsEscapeAttr, ATTR_TEXT);
time("Bun.escapeHTML attr", (s) => Bun.escapeHTML(s).replace(/"/g, "&quot;"), ATTR_TEXT);

// ─── Attr escape with pre-allocation ───────────────────────────────────

const REPLACE_QUOTE = /"/g;
function bunEscapeAttr(s: string): string {
  return Bun.escapeHTML(s).replace(REPLACE_QUOTE, "&quot;");
}

console.log("\n=== Attr escape (Bun + replace quote) ===");
time("Bun + .replace quote", bunEscapeAttr, ATTR_TEXT);
time("Bun + .replace quote long", bunEscapeAttr, LONGTEXT);
