import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import config from "../../docs.config.js";
import { buildMinimatchIndex } from "../search/minimatch-build.js";
import { generateLlmsFullTxt } from "./build-static-assets.js";

it("writes search and full-text exports incrementally without changing their format", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "vincle-rendered-assets-"));
  const pages = [
    {
      url: "/first",
      title: 'First "page"',
      html: "<nav>Navigation</nav><main><p>First &amp; body.</p></main>",
    },
    { url: "/second", title: "Second", html: "<main><p>Second body.</p></main>" },
  ];
  try {
    async function* htmlPages() {
      yield* pages;
    }
    async function* textPages() {
      yield { ...pages[0]!, text: "First & body." };
      yield { ...pages[1]!, text: "Second body." };
    }
    await buildMinimatchIndex(htmlPages(), path.join(out, "search-index.json"));
    expect(await readFile(path.join(out, "search-index.json"), "utf8")).toBe(
      JSON.stringify([
        { url: pages[0]!.url, title: pages[0]!.title, text: "First & body." },
        { url: pages[1]!.url, title: pages[1]!.title, text: "Second body." },
      ]),
    );
    await generateLlmsFullTxt(textPages(), config, out);
    expect(await readFile(path.join(out, "llms-full.txt"), "utf8")).toBe(
      [
        `# ${config.title}: Full documentation`,
        "",
        `> ${config.description}`,
        "",
        "---",
        `# ${pages[0]!.title}`,
        `Source: ${config.site ?? ""}/first`,
        "",
        "First & body.",
        "",
        "---",
        "# Second",
        `Source: ${config.site ?? ""}/second`,
        "",
        "Second body.",
        "",
      ].join("\n"),
    );
    await buildMinimatchIndex([], path.join(out, "search-index.json"));
    expect(await readFile(path.join(out, "search-index.json"), "utf8")).toBe("[]");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
