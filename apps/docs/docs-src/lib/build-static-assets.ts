import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResolvedDocsConfig } from "../types.js";

import { htmlToText } from "./html-text.js";

export async function generateLlmsTxt(
  pages: { url: string; title: string; html: string }[],
  config: ResolvedDocsConfig,
  outDir: string,
): Promise<void> {
  const lines: string[] = [
    `# ${config.title} — ${config.tagline ?? "Documentation"}`,
    "",
    `> ${config.description}`,
    "",
    "## Pages",
    "",
  ];
  for (const page of pages) {
    const site = config.site ?? "";
    lines.push(`- [${page.title}](${site}${page.url})`);
  }
  lines.push("");
  await writeFile(path.join(outDir, "llms.txt"), lines.join("\n"), "utf-8");
}

export async function generateLlmsFullTxt(
  pages: { url: string; title: string; html: string; text: string }[],
  config: ResolvedDocsConfig,
  outDir: string,
): Promise<void> {
  const parts: string[] = [
    `# ${config.title} — Full documentation`,
    "",
    `> ${config.description}`,
    "",
  ];
  for (const page of pages) {
    parts.push(`---`);
    parts.push(`# ${page.title}`);
    parts.push(`Source: ${config.site ?? ""}${page.url}`);
    parts.push("");
    parts.push(page.text);
    parts.push("");
  }
  await writeFile(path.join(outDir, "llms-full.txt"), parts.join("\n"), "utf-8");
}

export async function updateRobotsTxt(
  outDir: string,
  hasSitemap: boolean,
  siteUrl: string | null,
): Promise<void> {
  const lines: string[] = [
    "User-agent: *",
    "Allow: /",
    "",
    "# AI crawlers",
    "User-agent: GPTBot",
    "Disallow: /",
    "User-agent: Google-Extended",
    "Disallow: /",
    "User-agent: CCBot",
    "Disallow: /",
    "User-agent: anthropic-ai",
    "Disallow: /",
    "User-agent: PerplexityBot",
    "Disallow: /",
    "",
    "# Training opt-out",
    "User-agent: FacebookBot",
    "Disallow: /",
    "",
  ];

  if (hasSitemap && siteUrl) {
    const base = siteUrl.replace(/\/+$/, "");
    lines.push(`Sitemap: ${base}/sitemap.xml`);
  }

  await writeFile(path.join(outDir, "robots.txt"), lines.join("\n"), "utf-8");
}

export function extractPlainText(html: string): string {
  return htmlToText(html);
}
