import type { ResolvedDocsConfig } from "../types.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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
  await writeFile(
    path.join(outDir, "llms-full.txt"),
    parts.join("\n"),
    "utf-8",
  );
}

export async function generateManifest(
  config: ResolvedDocsConfig,
  outDir: string,
): Promise<void> {
  const manifest = {
    name: config.title,
    short_name: config.title,
    description: config.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

export async function generateSecurityTxt(
  config: ResolvedDocsConfig,
  outDir: string,
): Promise<void> {
  const wellKnownDir = path.join(outDir, ".well-known");
  await mkdir(wellKnownDir, { recursive: true });
  const site = config.site ?? "https://vincle.netlify.app";
  const lines = [
    "# Security",
    "# --------",
    "",
    "Contact: https://github.com/vincle/vincle/security/advisories/new",
    "Contact: mailto:christophe.jean@proton.me",
    "Preferred-Languages: en, fr",
    `Canonical: ${site}/.well-known/security.txt`,
    "Policy: https://github.com/vincle/vincle/security/policy",
    "Encryption: https://github.com/vincle/vincle/blob/main/SECURITY.md",
    "",
  ];
  await writeFile(
    path.join(wellKnownDir, "security.txt"),
    lines.join("\n"),
    "utf-8",
  );
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
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}
