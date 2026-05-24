import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import config from "../../docs.config.js";
import { initBuild, rebuildAll } from "./build-engine.js";
import { editUrlFor } from "./page-history.js";
import { renderDocument } from "./render-document.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../..");
const DIST_DIR = path.join(PROJECT_DIR, "dist");

// The Vite manifest comes from `build`, which `test` now depends on (see
// `apps/docs/turbo.json`). The fallback builds it for a `bun test` launched
// by hand, outside turbo.
//
// Explicit budget: bun's default is 5s, and this hook does a Vite build plus
// a full render. 1.2s here, over 5s on a fresh runner where the 18 MB of
// Shiki grammars are read from a cold page cache.
beforeAll(async () => {
  if (!existsSync(path.join(PROJECT_DIR, "dist/assets/.vite/manifest.json"))) {
    const proc = Bun.spawnSync(["bun", "run", "build:vite"], { cwd: PROJECT_DIR });
    if (!proc.success) throw new Error(proc.stderr.toString());
  }
  await initBuild();
  await rebuildAll();
}, 120_000);

describe("SSG build", () => {
  it("produces index.html", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("produces robots.txt", async () => {
    const robots = await readFile(path.join(DIST_DIR, "robots.txt"), "utf-8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });

  it("produces 404.html", async () => {
    const html = await readFile(path.join(DIST_DIR, "404.html"), "utf-8");
    expect(html).toContain("Page Not Found");
    expect(html).toContain("404");
  });

  it("produces search-index.json (array of entries with body text)", async () => {
    const index = await readFile(path.join(DIST_DIR, "search-index.json"), "utf-8");
    const data = JSON.parse(index);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("url");
    expect(data[0]).toHaveProperty("title");
    expect(data[0]).toHaveProperty("text");
    const hasBodyText = data.some((d: { text: string }) => d.text && d.text.length > 50);
    expect(hasBodyText).toBe(true);
  });

  it("builds all page files", async () => {
    const pages = [
      "index.html",
      "guide/getting-started/installation.html",
      "guide/introduction.html",
      "api/core/context.html",
      "integration/overview.html",
    ];
    for (const page of pages) {
      expect(existsSync(path.join(DIST_DIR, page))).toBe(true);
    }
  });

  it("injects Vite assets in pages", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toMatch(/<script.*?type="module".*?src="\/assets\/client-.*?\.js".*?>/);
    expect(html).toMatch(/<link.*?rel="stylesheet".*?href="\/assets\/client-.*?\.css".*?>/);
  });

  it("includes canonical link when config.site is set", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("https://vincle.cjean.fr/");
  });

  it("the print stylesheet agrees with config.site", async () => {
    // `@media print` repeats the host, and CSS cannot read the config.
    const css = await readFile(path.join(PROJECT_DIR, "docs-src/styles/main.css"), "utf-8");
    const match = /content: " \((https:\/\/[^"]*?)" attr\(href\)/.exec(css);
    expect(match, "no absolute-URL rule in the print stylesheet").not.toBeNull();
    expect(config.site, "config.site is unset — nothing to agree with").toBeTruthy();
    expect(match![1]).toBe(config.site!);
  });

  it("produces llms.txt", async () => {
    const data = await readFile(path.join(DIST_DIR, "llms.txt"), "utf-8");
    expect(data).toContain("Vincle");
    expect(data).toContain("Installation");
  });

  it("emits neither security.txt nor manifest.json", () => {
    // Removed deliberately, not broken: this test pins the removal so a
    // comeback happens knowingly.
    expect(existsSync(path.join(DIST_DIR, ".well-known/security.txt"))).toBe(false);
    expect(existsSync(path.join(DIST_DIR, "manifest.json"))).toBe(false);
  });

  it("produces 500.html", async () => {
    const html = await readFile(path.join(DIST_DIR, "500.html"), "utf-8");
    expect(html).toContain("Server Error");
    expect(html).toContain("500");
  });

  it("includes meta tags from specification.website", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="referrer"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('http-equiv="Permissions-Policy"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('translate="no"');
    expect(html).toContain("inert");
  });
});

/** What a page declares must exist. */
describe("everything a page declares exists", () => {
  it("no local path leads nowhere", async () => {
    const resolves = async (url: string): Promise<boolean> =>
      (await Bun.file(path.join(DIST_DIR, url)).exists()) ||
      (await Bun.file(path.join(DIST_DIR, `${url}.html`)).exists()) ||
      (await Bun.file(path.join(DIST_DIR, url, "index.html")).exists());

    const broken: string[] = [];
    for (const file of [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)].toSorted()) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      const declared = new Set(
        [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)]
          .map((m) => m[1]!)
          .filter((u) => u !== "/"),
      );
      for (const url of declared) {
        if (!(await resolves(url))) broken.push(`${file} → ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

/** Nothing may inline the code-block assets: they belong to the client bundle. */
describe("code-block assets are shipped once, in the bundle", () => {
  const pageFiles = (): string[] => [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)].toSorted();

  /**
   * A real parser, not a regex: `guide/security.html` carries an *escaped*
   * `<script>` inside a `data-code` attribute, twice.
   */
  async function inlineBlocks(html: string): Promise<string[]> {
    const blocks: string[] = [];
    let current = "";
    const collect = {
      element(): void {
        current = "";
      },
      text(chunk: { text: string; lastInTextNode: boolean }): void {
        current += chunk.text;
        if (chunk.lastInTextNode && current !== "") {
          blocks.push(current);
          current = "";
        }
      },
    };
    await new HTMLRewriter()
      .on("style", collect)
      .on("script", collect)
      .transform(new Response(html))
      .text();
    return blocks;
  }

  it("no page inlines the Expressive Code stylesheet", async () => {
    const offenders: string[] = [];
    for (const file of pageFiles()) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      const blocks = await inlineBlocks(html);
      if (blocks.some((b) => b.includes(".expressive-code{"))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no page carries the same style or script block twice", async () => {
    const offenders: string[] = [];
    for (const file of pageFiles()) {
      const blocks = await inlineBlocks(await readFile(path.join(DIST_DIR, file), "utf-8"));
      if (new Set(blocks).size !== blocks.length) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the client bundle carries the stylesheet and the JS instead", async () => {
    const assets = path.join(DIST_DIR, "assets");
    const read = async (pattern: string): Promise<string> => {
      const [file] = [...new Bun.Glob(pattern).scanSync(assets)];
      expect(file, `no ${pattern} in dist/assets`).toBeDefined();
      return readFile(path.join(assets, file!), "utf-8");
    };
    expect(await read("client-*.css")).toContain(".expressive-code{");
    // Both modules from `getJsModules()`, identified by their own error labels.
    const js = await read("client-*.js");
    expect(js).toContain("[EC] copy-js-module failed:");
    expect(js).toContain("[EC] tabindex-js-module failed:");
  });
});

/** `PageFooter` gates on `editUrl` and `lastUpdated`; both were hardcoded to null. */
describe("page footer", () => {
  const contentPages = (): string[] =>
    [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)]
      .filter((f) => !["404.html", "500.html"].includes(f))
      .toSorted();

  it("every content page links to its own source file", async () => {
    const missing: string[] = [];
    for (const file of contentPages()) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      const match = /href="https:\/\/github\.com\/[^"]*\/edit\/main\/apps\/docs\/([^"]+)"/.exec(
        html,
      );
      if (!match) missing.push(file);
    }
    expect(missing).toEqual([]);
  });

  it("the file each link points at exists", async () => {
    // A well-formed link can still 404; only the filesystem says so.
    const broken: string[] = [];
    for (const file of contentPages()) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      const match = /\/edit\/main\/apps\/docs\/([^"]+)"/.exec(html);
      if (match && !existsSync(path.join(PROJECT_DIR, match[1]!))) {
        broken.push(`${file} → ${match[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("carries a real commit date, not the build date", async () => {
    const html = await readFile(path.join(DIST_DIR, "guide/faq.html"), "utf-8");
    const match = /<time[^>]*datetime="([^"]+)"/.exec(html);
    expect(match, "no <time> in the footer").not.toBeNull();
    const date = new Date(match![1]!);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("error pages have no footer — they have no source file", async () => {
    for (const file of ["404.html", "500.html"]) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      expect(html, file).not.toContain("/edit/main/");
    }
  });
});

describe("editUrlFor", () => {
  const base = "https://example.test/edit/main/apps/docs";
  const inside = path.join(PROJECT_DIR, "docs-src/pages/guide/faq.mdx");

  it("appends the path within the app", () => {
    expect(editUrlFor(base, inside)).toBe(`${base}/docs-src/pages/guide/faq.mdx`);
  });

  it("tolerates a trailing slash on the base", () => {
    expect(editUrlFor(`${base}/`, inside)).toBe(`${base}/docs-src/pages/guide/faq.mdx`);
  });

  it("returns null when unconfigured", () => {
    expect(editUrlFor(null, inside)).toBeNull();
  });

  it("returns null for a file outside the app", () => {
    expect(editUrlFor(base, "/etc/passwd")).toBeNull();
  });
});

describe("renderDocument", () => {
  it("renders simple JSX to HTML string", async () => {
    const html = await renderDocument(() => <h1>Hello Test</h1>);
    expect(html).toContain("<h1>");
    expect(html).toContain("Hello Test");
    expect(html).toContain("</h1>");
  });

  it("renders nested elements", async () => {
    const html = await renderDocument(() => (
      <div class="test">
        <span>nested</span>
      </div>
    ));
    expect(html).toContain('<div class="test">');
    expect(html).toContain("<span>nested</span>");
  });

  it("escapes text content", async () => {
    const html = await renderDocument(() => <div>{"<script>alert(1)</script>"}</div>);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
