import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
    "Every page is also available as Markdown at its URL plus `.md` (home page: `/.md`).",
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
    // Content Signals (draft-romm-aipref-contentsignals): search and agent use
    // are welcome, training on this content is not.
    "Content-Signal: ai-train=no, search=yes, ai-input=no",
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

  if (siteUrl) {
    const base = siteUrl.replace(/\/+$/, "");
    if (hasSitemap) lines.push(`Sitemap: ${base}/sitemap.xml`);
    lines.push(`Agentmap: ${base}/.well-known/ai-catalog.json`);
  }

  await writeFile(path.join(outDir, "robots.txt"), lines.join("\n"), "utf-8");
}

/**
 * Netlify `_headers` for the publish directory: the homepage advertises its
 * machine-readable resources with RFC 8288 Link headers (per-page Markdown
 * twins are advertised in the HTML itself, one `Link` value per page cannot
 * come from a static file), and the agent manifests get JSON content types and
 * open CORS so cross-origin agents can read them.
 */
export async function generateNetlifyHeaders(outDir: string): Promise<void> {
  const link =
    '</.md>; rel="alternate"; type="text/markdown", ' +
    '</llms.txt>; rel="service-doc", ' +
    '</llms-full.txt>; rel="service-doc", ' +
    '</auth.md>; rel="describedby", ' +
    '</.well-known/ai-catalog.json>; rel="service-desc"';
  const content = [
    "/",
    `  Link: ${link}`,
    "",
    "/.well-known/ai-catalog.json",
    "  Content-Type: application/json",
    "  Access-Control-Allow-Origin: *",
    "",
    "/.well-known/agent-skills/index.json",
    "  Content-Type: application/json",
    "",
    "/llms.txt, /llms-full.txt, /search-index.json",
    "  Access-Control-Allow-Origin: *",
    "",
  ].join("\n");
  await writeFile(path.join(outDir, "_headers"), content, "utf-8");
}

interface AgentSkillEntry {
  name: string;
  type: string;
  description: string;
  url: string;
  digest: string;
}

function frontmatterField(markdown: string, field: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (block === null) return null;
  const line = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(block[1]!);
  if (line === null) return null;
  return line[1]!.trim().replace(/^['"]|['"]$/g, "");
}

/** List `public/.well-known/agent-skills/<name>/SKILL.md` from the publish dir. */
async function listAgentSkills(outDir: string): Promise<AgentSkillEntry[]> {
  const root = path.join(outDir, ".well-known", "agent-skills");
  if (!existsSync(root)) return [];
  const skills: AgentSkillEntry[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const content = await readFile(file, "utf-8");
    skills.push({
      name: entry.name,
      type: "skill-md",
      description: frontmatterField(content, "description") ?? "",
      url: `/.well-known/agent-skills/${entry.name}/SKILL.md`,
      digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** Agent Skills discovery index (agentskills.io schema 0.2.0), digests computed at build. */
export async function generateAgentSkillsIndex(outDir: string): Promise<void> {
  const skills = await listAgentSkills(outDir);
  if (skills.length === 0) return;
  const root = path.join(outDir, ".well-known", "agent-skills");
  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills,
  };
  await writeFile(path.join(root, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf-8");
}

/**
 * ARD (Agentic Resource Discovery) manifest: what agents can find on this
 * host. Only resources that actually exist are listed — today, the agent
 * skills. No fabricated MCP servers or A2A agents.
 */
export async function generateAiCatalog(outDir: string, config: ResolvedDocsConfig): Promise<void> {
  const site = config.site;
  if (site === null) return;
  const base = site.replace(/\/+$/, "");
  const host = new URL(base).hostname;
  const skills = await listAgentSkills(outDir);
  const catalog = {
    specVersion: "1.0",
    host: { displayName: config.title, identifier: `did:web:${host}` },
    entries: skills.map((skill) => ({
      identifier: `urn:air:${host}:skill:${skill.name}`,
      displayName: `${config.title} — ${skill.name}`,
      type: "text/markdown",
      url: `${base}${skill.url}`,
      description: skill.description,
      representativeQueries: [
        "where can I find the Vincle documentation",
        "how do I render a Vincle component to an HTML string",
        "Vincle progressive HTML streaming guide",
      ],
    })),
  };
  const dir = path.join(outDir, ".well-known");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "ai-catalog.json"),
    JSON.stringify(catalog, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Emit a `<url>.md` twin for every content page, announced from the HTML head
 * via `rel="alternate" type="text/markdown"`. MDX pages are copied verbatim —
 * the source is the documentation; code examples live in the fences themselves
 * (`example` marks a full module, `output` one the build runs).
 */
export async function generateMarkdownAlternates(
  pages: { url: string; file: string }[],
  outDir: string,
): Promise<void> {
  for (const page of pages) {
    if (!page.file.endsWith(".mdx")) continue;
    const target = path.join(outDir, `${page.url}.md`);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(page.file, target);
  }
}

export function extractPlainText(html: string): string {
  return htmlToText(html);
}
