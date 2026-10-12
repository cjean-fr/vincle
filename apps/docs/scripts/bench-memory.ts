// Synthetic content-only build: 10,000 MDX pages, 100 paragraphs and 3 code blocks each.
// Includes a homepage to exercise the single content-history Git lookup.
// Prerequisite: build the site package and the docs Vite assets.
// BENCH_MAX_RSS_MIB=512 bun run --cwd apps/docs bench:memory
// BENCH_PAGES, BENCH_PARAGRAPHS and BENCH_CODE_BLOCKS adjust the input.
// BENCH_CODE_BLOCKS=0 restores the prose-only fixture; Linux RSS includes children.
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { initBuild, rebuildAll } from "../docs-src/lib/build-engine.js";
import { codeHighlighter } from "../docs-src/lib/code-highlighter.js";
import config from "../docs.config.js";

const count = Number(process.env["BENCH_PAGES"] ?? 10000);
const paragraphs = Number(process.env["BENCH_PARAGRAPHS"] ?? 100);
const codeBlocks = Number(process.env["BENCH_CODE_BLOCKS"] ?? 3);
const fixtureParent = path.join(config.pages, ".compiled");
await mkdir(fixtureParent, { recursive: true });
const root = await mkdtemp(path.join(fixtureParent, "memory-bench-"));
const pages = path.join(root, "pages");
const out = path.join(root, "out");
let totalPeakKiB = 0;
function processTreeRss(pid: number): number {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    return (
      rss +
      (children
        ? children.split(/\s+/).reduce((sum, child) => sum + processTreeRss(Number(child)), 0)
        : 0)
    );
  } catch {
    return 0;
  }
}
const sampler = setInterval(() => {
  totalPeakKiB = Math.max(totalPeakKiB, processTreeRss(process.pid));
}, 25);
const paragraph =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
function codeBlock(page: number, block: number): string {
  return [
    `\`\`\`tsx title="example-${block + 1}.tsx"`,
    'import { renderToString } from "@vincle/core";',
    "",
    "interface ArticleProps {",
    "  title: string;",
    "  paragraphs: readonly string[];",
    "}",
    "",
    "function Article({ title, paragraphs }: ArticleProps) {",
    "  return (",
    '    <article class="prose">',
    "      <h1>{title}</h1>",
    "      {paragraphs.map((text) => <p>{text}</p>)}",
    "    </article>",
    "  );",
    "}",
    "",
    `const html = await renderToString(<Article title="Page ${page}, example ${block + 1}" paragraphs={["Lorem ipsum", "Dolor sit amet"]} />);`,
    "console.log(html);",
    "```",
  ].join("\n");
}

try {
  await mkdir(pages);
  for (let i = 0; i < count; i++) {
    const sections: string[] = [];
    let inserted = 0;
    for (let p = 0; p < paragraphs; p++) {
      sections.push(paragraph);
      while (inserted < Math.floor(((p + 1) * codeBlocks) / paragraphs)) {
        sections.push(codeBlock(i, inserted++));
      }
    }
    while (inserted < codeBlocks) sections.push(codeBlock(i, inserted++));
    await writeFile(
      path.join(pages, i === 0 ? "index.mdx" : `page-${String(i).padStart(5, "0")}.mdx`),
      `---\ntitle: Page ${i}\n---\n\n# Page ${i}\n\n${sections.join("\n\n")}\n`,
    );
  }
  Object.assign(config, {
    pages,
    out,
    tabs: [],
    site: null,
    sitemap: false,
    editUrl: null,
    layout: ({ children }: { children: import("@vincle/core").JSX.Element }) => children,
  });
  const start = performance.now();
  await initBuild();
  await rebuildAll();
  const parentPeakMiB = process.resourceUsage().maxRSS / 1024;
  const rssMiB = Math.max(parentPeakMiB, totalPeakKiB / 1024);
  const seconds = (performance.now() - start) / 1000;
  console.log(
    JSON.stringify({
      pages: count,
      paragraphs,
      codeBlocks,
      highlighter: codeHighlighter,
      peakRssMiB: Math.round(rssMiB),
      parentPeakRssMiB: Math.round(parentPeakMiB),
      seconds,
      pagesPerSecond: Math.round(count / seconds),
    }),
  );
  const limit = Number(process.env["BENCH_MAX_RSS_MIB"] ?? Infinity);
  if (rssMiB > limit) throw new Error(`Peak RSS ${Math.round(rssMiB)} MiB exceeds ${limit} MiB`);
} finally {
  clearInterval(sampler);
  await rm(root, { recursive: true, force: true });
}
