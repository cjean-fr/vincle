import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";

import { sitemapOutputs } from "./sitemap.js";

const site = new URL("https://example.com/docs/");
const limit = 52_428_800;

function contents(count: number, suffix = "") {
  return [
    ...sitemapOutputs(
      Array.from({ length: count }, (_, i) => `${site.href}${i}${suffix}`),
      site,
    ),
  ];
}

test("keeps exactly 50,000 URLs in one sitemap, splits the next URL and preserves the site base", () => {
  expect(contents(50_000).map((output) => output.path)).toEqual(["sitemap.xml"]);
  const outputs = contents(50_001);
  expect(outputs.map((output) => output.path)).toEqual([
    "sitemap-1.xml",
    "sitemap-2.xml",
    "sitemap.xml",
  ]);
  expect((outputs[0]!.content as string).match(/<url>/g)).toHaveLength(50_000);
  expect((outputs[1]!.content as string).match(/<url>/g)).toHaveLength(1);
  expect(outputs[2]!.content).toContain("<sitemapindex");
  expect(outputs[2]!.content).toContain("https://example.com/docs/sitemap-2.xml");
});

for (const [label, count, suffix] of [
  ["XML escaping", 10_000, "&".repeat(1100)],
  ["UTF-8 bytes", 25_000, "é".repeat(1100)],
] as const) {
  test(`splits at 50 MiB counting ${label} and XML wrappers`, () => {
    const outputs = contents(count, suffix);
    expect(outputs).toHaveLength(3);
    let total = 0;
    for (const output of outputs.slice(0, -1)) {
      const xml = output.content as string;
      expect(Buffer.byteLength(xml)).toBeLessThanOrEqual(limit);
      total += xml.match(/<url>/g)!.length;
    }
    expect(total).toBe(count);
  });
}

test("emits an empty valid sitemap when nothing is included", () => {
  const outputs = contents(0);
  expect(outputs).toHaveLength(1);
  expect(outputs[0]!.content).toContain("</urlset>");
});
