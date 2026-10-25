/** Every published page gets a social card, except error pages. */
export function hasSocialCard(url: string): boolean {
  return url !== "/404";
}

/** Where a page's card is published: one PNG per route, beside the HTML. */
export function socialCardPath(url: string): string {
  const route = url.replace(/^\/+|\/+$/g, "");
  return `social/${route === "" ? "index" : route}.png`;
}

export interface SocialCard {
  title: string;
  /** The tab the page belongs to; `null` on the home page. */
  section: string | null;
  summary: string;
}

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 80;
const FONT = "DejaVu Sans,Arial,Helvetica,sans-serif";
const MONO = "DejaVu Sans Mono,Menlo,Consolas,monospace";

/** The docs' dark theme, so a shared link looks like the page it opens. */
const COLOR = {
  bg: "#101b2b",
  glow: "#1b3357",
  text: "#edf2f8",
  secondary: "#a5b5ca",
  accent: "#8db5ff",
  border: "#293b53",
};

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Greedy word wrap by character budget: SVG text does not wrap, and librsvg
 * gives no measurement, so `perLine` is the width the font size leaves.
 */
export function wrap(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= perLine || line === "") line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s,.;:]+$/, "")}…`;
  return kept;
}

/** The first sentence or two of a page's text, within `limit` characters. */
export function summarize(text: string, title: string, limit = 150): string {
  const body = text.startsWith(title) ? text.slice(title.length).trim() : text.trim();
  if (body.length <= limit) return body;
  const cut = body.slice(0, limit);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > limit / 2) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:]+$/, "")}…`;
}

export function socialCardSvg({ title, section, summary }: SocialCard): string {
  // An API page named after an identifier (`renderToString`) shows it as code.
  const code = section === "API" && /^[\w$.]+$/.test(title);
  const titleLines = wrap(title, code ? 24 : 26, 2);
  const summaryLines = wrap(summary, 54, 3);
  const titleSize = 64;
  const titleLead = 76;
  const summarySize = 32;
  const summaryLead = 46;
  // Title and summary sit as one block on the lower two thirds, bottom-aligned
  // above the accent rule, whatever their line counts.
  const ruleY = HEIGHT - MARGIN - 6;
  const summaryTop = ruleY - 56 - (summaryLines.length - 1) * summaryLead;
  const titleTop = summaryTop - 84 - (titleLines.length - 1) * titleLead;
  const pill = section
    ? `<g transform="translate(${WIDTH - MARGIN} ${MARGIN + 36})">
        <text x="0" y="11" text-anchor="end" font-size="26" font-weight="700" fill="${COLOR.accent}" letter-spacing="3">${escapeXml(section.toUpperCase())}</text>
      </g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="1" cy="0" r="0.9">
      <stop offset="0" stop-color="${COLOR.glow}"/>
      <stop offset="1" stop-color="${COLOR.bg}"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" fill="none" stroke="${COLOR.border}"/>
  <g font-family="${FONT}">
    <rect x="${MARGIN}" y="${MARGIN}" width="72" height="72" rx="16" fill="${COLOR.text}"/>
    <text x="${MARGIN + 36}" y="${MARGIN + 50}" text-anchor="middle" font-size="40" font-weight="700" fill="${COLOR.bg}">v.</text>
    <text x="${MARGIN + 96}" y="${MARGIN + 34}" font-size="32" font-weight="700" fill="${COLOR.text}">Vincle</text>
    <text x="${MARGIN + 96}" y="${MARGIN + 66}" font-size="22" fill="${COLOR.secondary}">vincle.cjean.fr</text>
    ${pill}
    ${titleLines
      .map(
        (line, i) =>
          `<text x="${MARGIN}" y="${titleTop + i * titleLead}" font-size="${titleSize}" font-weight="700" fill="${COLOR.text}"${code ? ` font-family="${MONO}"` : ' letter-spacing="-1"'}>${escapeXml(line)}</text>`,
      )
      .join("\n    ")}
    ${summaryLines
      .map(
        (line, i) =>
          `<text x="${MARGIN}" y="${summaryTop + i * summaryLead}" font-size="${summarySize}" fill="${COLOR.secondary}">${escapeXml(line)}</text>`,
      )
      .join("\n    ")}
  </g>
  <rect x="${MARGIN}" y="${ruleY}" width="96" height="6" rx="3" fill="${COLOR.accent}"/>
</svg>`;
}

export async function socialCardPng(card: SocialCard): Promise<Uint8Array> {
  // Loaded on demand: page rendering imports this module for the path alone.
  const { default: sharp } = await import("sharp");
  return new Uint8Array(
    await sharp(Buffer.from(socialCardSvg(card)))
      .png()
      .toBuffer(),
  );
}
