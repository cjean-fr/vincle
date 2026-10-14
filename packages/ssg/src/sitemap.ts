import { Buffer } from "node:buffer";

import type { SiteOutput } from "./outputs.js";

import { failure } from "./errors.js";

const MAX_ENTRIES = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;
const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
const namespace = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]!;
  });
}

function entryLimit(message: string, context: Record<string, string | number | boolean>): never {
  throw failure(message, {
    reason: "INVALID_OUTPUT",
    hint: "Shorten the affected URLs or disable the built-in sitemap and publish separate sitemap indexes. Each sitemap and index must fit within 50,000 entries and 52,428,800 uncompressed UTF-8 bytes.",
    context,
  });
}

/** Size includes XML escaping, the declaration and the enclosing tags. */
export function* sitemapOutputs(urls: Iterable<string>, site: URL): Generator<SiteOutput> {
  const head = `${declaration}<urlset ${namespace}>`;
  const tail = "</urlset>\n";
  const overhead = Buffer.byteLength(head + tail);
  const chunks: string[] = [];
  let entries: string[] = [];
  let bytes = overhead;
  for (const url of urls) {
    const entry = `<url><loc>${escapeXml(url)}</loc></url>`;
    const size = Buffer.byteLength(entry);
    if (overhead + size > MAX_BYTES)
      entryLimit("A single sitemap entry exceeds the uncompressed size limit.", {
        url,
        bytes: overhead + size,
      });
    if (entries.length === MAX_ENTRIES || bytes + size > MAX_BYTES) {
      chunks.push(head + entries.join("") + tail);
      entries = [];
      bytes = overhead;
    }
    entries.push(entry);
    bytes += size;
  }
  if (entries.length || !chunks.length) chunks.push(head + entries.join("") + tail);
  if (chunks.length === 1) {
    yield { path: "sitemap.xml", content: chunks[0]! };
    return;
  }
  if (chunks.length > MAX_ENTRIES)
    entryLimit("The sitemap index exceeds 50,000 sitemap files.", { count: chunks.length });
  const index =
    `${declaration}<sitemapindex ${namespace}>` +
    chunks
      .map(
        (_, i) =>
          `<sitemap><loc>${escapeXml(new URL(`sitemap-${i + 1}.xml`, site).href)}</loc></sitemap>`,
      )
      .join("") +
    "</sitemapindex>\n";
  if (Buffer.byteLength(index) > MAX_BYTES)
    entryLimit("The sitemap index exceeds the uncompressed size limit.", {
      bytes: Buffer.byteLength(index),
    });
  for (let i = 0; i < chunks.length; i++)
    yield { path: `sitemap-${i + 1}.xml`, content: chunks[i]! };
  yield { path: "sitemap.xml", content: index };
}
