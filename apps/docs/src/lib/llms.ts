import type { ResolvedDocsConfig } from "./types.js";

import { type Locale } from "./i18n/locale.js";

export function llmsTxt(
  pages: readonly { url: string; title: string }[],
  config: ResolvedDocsConfig,
  locale: Locale = "en",
): string {
  const lines: string[] = [
    `# ${config.title}: ${config.tagline ?? "Documentation"}`,
    "",
    `> ${config.description}`,
    "",
    locale === "fr"
      ? "Chaque page est également disponible en Markdown à son URL suivie de `.md` (accueil : `/fr/index.md`)."
      : "Every page is also available as Markdown at its URL plus `.md` (home page: `/index.md`).",
    "",
    "## Pages",
    "",
  ];
  for (const page of pages) lines.push(`- [${page.title}](${config.site ?? ""}${page.url})`);
  lines.push("");
  return lines.join("\n");
}

export async function llmsFullTxt(
  pages:
    | Iterable<{ url: string; title: string; text: string }>
    | AsyncIterable<{ url: string; title: string; text: string }>,
  config: ResolvedDocsConfig,
  locale: Locale = "en",
): Promise<string> {
  let content = [
    `# ${config.title}: ${locale === "fr" ? "Documentation complète" : "Full documentation"}`,
    "",
    `> ${config.description}`,
    "",
  ].join("\n");
  for await (const page of pages)
    content += [
      "",
      "---",
      `# ${page.title}`,
      `Source: ${config.site ?? ""}${page.url}`,
      "",
      page.text,
      "",
    ].join("\n");
  return content;
}
