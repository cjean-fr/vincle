import { fullUrl } from "@vincle/ssg";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import config from "../../docs.config.js";
import ssg from "../../ssg.config.js";

export const meta = { title: "Agent discovery", sitemap: false, search: false };

interface AgentSkill {
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

/** `public/.well-known/agent-skills/<name>/SKILL.md`, published as is. */
async function agentSkills(): Promise<AgentSkill[]> {
  const root = path.resolve(config.pages, "../../public/.well-known/agent-skills");
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const skills: AgentSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const content = await readFile(path.join(root, entry.name, "SKILL.md"), "utf-8").catch(
      () => null,
    );
    if (content === null) continue;
    skills.push({
      name: entry.name,
      type: "skill-md",
      description: frontmatterField(content, "description") ?? "",
      url: `/.well-known/agent-skills/${entry.name}/SKILL.md`,
      digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    });
  }
  return skills.toSorted((a, b) => a.name.localeCompare(b.name));
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

/**
 * Agent Skills discovery index (agentskills.io schema 0.2.0) and ARD manifest.
 * The catalog lists only resources that exist: today, the agent skills.
 */
export default async function* wellKnown() {
  const skills = await agentSkills();
  if (skills.length > 0)
    yield {
      path: ".well-known/agent-skills/index.json",
      content: json({
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills,
      }),
    };
  const site = ssg.site;
  if (!site) return;
  const host = new URL(site).hostname;
  yield {
    path: ".well-known/ai-catalog.json",
    content: json({
      specVersion: "1.0",
      host: { displayName: config.title, identifier: `did:web:${host}` },
      entries: skills.map((skill) => ({
        identifier: `urn:air:${host}:skill:${skill.name}`,
        displayName: `${config.title}: ${skill.name}`,
        type: "text/markdown",
        url: fullUrl(skill.url, site),
        description: skill.description,
        representativeQueries: [
          "where can I find the Vincle documentation",
          "how do I render a Vincle component to an HTML string",
          "Vincle progressive HTML streaming guide",
        ],
      })),
    }),
  };
}
