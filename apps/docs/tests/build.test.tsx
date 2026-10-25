import { describe, it, expect, beforeAll } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import config from "../docs.config.js";
import { editUrlFor, lastModified } from "../src/lib/page-history.js";
import ssg from "../ssg.config.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "..");
const DIST_DIR = path.join(PROJECT_DIR, "dist");

// `ssg build` is the production path: the tests read what it publishes.
beforeAll(() => {
  const proc = Bun.spawnSync(["bun", "run", "build"], { cwd: PROJECT_DIR });
  if (!proc.success) throw new Error(proc.stderr.toString());
}, 120_000);

describe("SSG build", () => {
  it("produces search-index.json (array of entries with body text)", async () => {
    const index = await readFile(path.join(DIST_DIR, "search-index.json"), "utf-8");
    const data = JSON.parse(index);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("url");
    expect(data[0]).toHaveProperty("title");
    expect(data[0]).toHaveProperty("text");
    const sitemap = await readFile(path.join(DIST_DIR, "sitemap.xml"), "utf8");
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(sitemap).toContain('hreflang="x-default"');
    expect(sitemap).not.toContain("/404");
    expect(new Set(data.map((page: { url: string }) => page.url)).size).toBe(data.length);
    for (const page of data) {
      expect(sitemap).toContain(`<loc>https://vincle.cjean.fr${page.url}</loc>`);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.text.length).toBeGreaterThan(0);
      expect(page.text).not.toMatch(/^\s*(?:<!doctype html|<html(?:\s|>))/i);
    }
    expect(await readFile(path.join(DIST_DIR, "llms-full.txt"), "utf8")).toContain(data[0].title);
    const adapters = data.find((d: { url: string }) => d.url === "/integration/flow/adapters");
    expect(adapters?.text).toContain("Browsers with declarative partial updates");
    const streaming = data.find((d: { url: string }) => d.url === "/integration/flow/streaming");
    expect(streaming?.keywords).toEqual(["suspense", "out-of-order", "progressive rendering"]);
    expect(adapters).not.toHaveProperty("keywords");
    const deployment = data.find((d: { url: string }) => d.url === "/integration/ssg/deployment");
    expect(deployment?.headings).toContainEqual({ id: "content-types", text: "Content types" });
  });

  it("emits meta keywords for a page that declares them", async () => {
    const html = await readFile(path.join(DIST_DIR, "integration/flow/streaming.html"), "utf-8");
    expect(html).toContain(
      '<meta name="keywords" content="suspense, out-of-order, progressive rendering">',
    );
    expect(await readFile(path.join(DIST_DIR, "index.html"), "utf-8")).not.toContain(
      'name="keywords"',
    );
  });

  it("injects Vite assets in pages", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toMatch(/<script.*?type="module".*?src="\/assets\/main-.*?\.js".*?>/);
    expect(html).toMatch(/<link.*?rel="stylesheet".*?href="\/assets\/main-.*?\.css".*?>/);
  });

  it("the print stylesheet agrees with ssg.site", async () => {
    // `@media print` repeats the host, and CSS cannot read the config.
    const css = await readFile(path.join(PROJECT_DIR, "src/_client/main.css"), "utf-8");
    const match = /content: " \((https:\/\/[^"]*?)" attr\(href\)/.exec(css);
    expect(match, "no absolute-URL rule in the print stylesheet").not.toBeNull();
    expect(ssg.site, "ssg.site is unset: nothing to agree with").toBeTruthy();
    expect(match![1]).toBe(ssg.site!);
  });

  it("produces llms.txt", async () => {
    const data = await readFile(path.join(DIST_DIR, "llms.txt"), "utf-8");
    expect(data).toContain("Vincle");
    expect(data).toContain("Installation");
  });

  it("produces every advertised Markdown twin", async () => {
    const htmls = [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)]
      .filter((f) => !/(?:^|\/)404\.html$/.test(f))
      .toSorted();
    expect(htmls.length).toBeGreaterThan(0);
    for (const html of htmls) {
      const rendered = await readFile(path.join(DIST_DIR, html), "utf-8");
      if (!rendered.includes('type="text/markdown"')) continue;
      const twin =
        html === "fr.html"
          ? path.join(DIST_DIR, "fr/index.md")
          : html === "index.html"
            ? path.join(DIST_DIR, "index.md")
            : path.join(DIST_DIR, html.replace(/\.html$/, ".md"));
      expect(await Bun.file(twin).exists(), `no .md twin for ${html}`).toBe(true);
    }
  });

  it("ships a verbatim MDX copy as each page's .md twin", async () => {
    for (const page of [
      "guide/getting-started/installation.mdx",
      "api/core/renderToString.mdx",
      "integration/flow/adapters.mdx",
    ]) {
      const twin = await readFile(path.join(DIST_DIR, `${page.replace(/\.mdx$/, ".md")}`), "utf-8");
      const source = await readFile(path.join(PROJECT_DIR, "src/pages", page), "utf-8");
      expect(twin, `${page} twin differs from source`).toBe(source);
    }
  });

  it("announces each twin from the page head, not from error pages", async () => {
    const index = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(index).toContain('<link rel="alternate" type="text/markdown" href="/index.md">');
    const page = await readFile(
      path.join(DIST_DIR, "guide/getting-started/installation.html"),
      "utf-8",
    );
    expect(page).toContain(
      '<link rel="alternate" type="text/markdown" href="/guide/getting-started/installation.md">',
    );
    for (const status of ["404.html"]) {
      const error = await readFile(path.join(DIST_DIR, status), "utf-8");
      expect(error).toContain("Page Not Found");
      expect(error).not.toContain('rel="alternate"');
    }
  });

  it("produces the agent discovery files", async () => {
    const robots = await readFile(path.join(DIST_DIR, "robots.txt"), "utf-8");
    expect(robots).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://vincle.cjean.fr/sitemap.xml\n",
    );

    const headers = await readFile(path.join(DIST_DIR, "_headers"), "utf-8");
    expect(headers).toContain('rel="alternate"; type="text/markdown"');
    expect(headers).toContain("Access-Control-Allow-Origin: *");
    expect(headers).toContain('rel="service-desc"');

    const catalog = JSON.parse(
      await readFile(path.join(DIST_DIR, ".well-known/ai-catalog.json"), "utf-8"),
    );
    expect(catalog.specVersion).toBeTruthy();
    expect(catalog.host.identifier).toBe("did:web:vincle.cjean.fr");
    expect(catalog.entries.length).toBeGreaterThan(0);
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(/^urn:air:vincle\.cjean\.fr:/);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
    }

    const index = JSON.parse(
      await readFile(path.join(DIST_DIR, ".well-known/agent-skills/index.json"), "utf-8"),
    );
    expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    const skill = index.skills.find((s: { name: string }) => s.name === "vincle-docs");
    expect(skill).toBeDefined();
    const skillBody = await readFile(
      path.join(DIST_DIR, ".well-known/agent-skills/vincle-docs/SKILL.md"),
      "utf-8",
    );
    const digest = "sha256:" + createHash("sha256").update(skillBody).digest("hex");
    expect(skill.digest).toBe(digest);
  });

  it("includes meta tags from specification.website", async () => {
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    expect(html).toStartWith("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="referrer"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('http-equiv="Permissions-Policy"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain("inert");
  });
});

/** What a page declares must exist. */
describe("everything a page declares exists", () => {
  /**
   * A real parser, not a regex: a code example showing `href="/app.css"` as
   * plain text (or inside a `data-code` copy-button attribute) is not a link.
   */
  async function declaredLocalPaths(html: string): Promise<Set<string>> {
    const urls = new Set<string>();
    const record = (raw: string | null): void => {
      if (!raw || !raw.startsWith("/")) return;
      const url = raw.split(/[#?]/)[0]!;
      if (url !== "/") urls.add(url);
    };
    await new HTMLRewriter()
      .on("[href]", {
        element(el) {
          record(el.getAttribute("href"));
        },
      })
      .on("[src]", {
        element(el) {
          record(el.getAttribute("src"));
        },
      })
      .transform(new Response(html))
      .text();
    return urls;
  }

  it("no local path leads nowhere", async () => {
    const resolves = async (url: string): Promise<boolean> =>
      (await Bun.file(path.join(DIST_DIR, url)).exists()) ||
      (await Bun.file(path.join(DIST_DIR, `${url}.html`)).exists()) ||
      (await Bun.file(path.join(DIST_DIR, url, "index.html")).exists());

    const broken: string[] = [];
    for (const file of [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)].toSorted()) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      for (const url of await declaredLocalPaths(html)) {
        if (!(await resolves(url))) broken.push(`${file} → ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

/** A shared link's card is built per page; a 404 on it would only show on the social network. */
describe("social cards", () => {
  it("every content page points og:image at a published 1200×630 PNG", async () => {
    const broken: string[] = [];
    for (const file of [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)].toSorted()) {
      if (/(?:^|\/)404\.html$/.test(file)) continue;
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      if (!image?.startsWith(`${ssg.site}/`)) {
        broken.push(`${file} → ${image ?? "no og:image"}`);
        continue;
      }
      const png = Bun.file(path.join(DIST_DIR, image.slice(ssg.site!.length)));
      if (!(await png.exists())) {
        broken.push(`${file} → ${image}`);
        continue;
      }
      // The PNG header: width and height are the big-endian words at 16 and 20.
      const header = new DataView(await png.slice(0, 24).arrayBuffer());
      const size = `${header.getUint32(16)}×${header.getUint32(20)}`;
      if (size !== "1200×630") broken.push(`${file} → ${size}`);
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
      const files = [...new Bun.Glob(pattern).scanSync(assets)];
      expect(files.length, `no ${pattern} in dist/assets`).toBeGreaterThan(0);
      return (
        await Promise.all(files.map((file) => readFile(path.join(assets, file), "utf-8")))
      ).join("\n");
    };
    const css = await read("main-*.css");
    expect(css).toContain(".docs-code-block");
    expect(css).toContain("--shiki-token-keyword");
    expect(css).toContain("--shiki-token-function");
    expect(css).not.toContain(".hljs-");
    const js = await read("main-*.js");
    expect(js).toContain("data-docs-copy");
    expect(js).not.toContain("@shikijs/");
    expect(js).not.toContain("createHighlighter");
  });
});

/** `PageFooter` gates on `editUrl` and `lastUpdated`; both were hardcoded to null. */
describe("page footer", () => {
  const contentPages = (): string[] =>
    [...new Bun.Glob("**/*.html").scanSync(DIST_DIR)]
      .filter((f) => !/(?:^|\/)404\.html$/.test(f))
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

  it("shows the Git modification date for the content directory only on the homepage", async () => {
    const latest = await lastModified(config.pages);
    const home = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    if (latest) expect(home).toContain(`datetime="${latest}"`);
    else expect(home).not.toContain("docs-page-footer-updated");
    for (const file of contentPages().filter((candidate) => candidate !== "index.html")) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      expect(html, file).not.toContain("docs-page-footer-updated");
    }
  });

  it("error pages have no footer: they have no source file", async () => {
    for (const file of ["404.html"]) {
      const html = await readFile(path.join(DIST_DIR, file), "utf-8");
      expect(html, file).not.toContain("/edit/main/");
    }
  });
});

describe("editUrlFor", () => {
  const base = "https://example.test/edit/main/apps/docs";
  const inside = path.join(PROJECT_DIR, "src/pages/guide/faq.mdx");

  it("appends the path within the app", () => {
    expect(editUrlFor(base, inside)).toBe(`${base}/src/pages/guide/faq.mdx`);
  });

  it("tolerates a trailing slash on the base", () => {
    expect(editUrlFor(`${base}/`, inside)).toBe(`${base}/src/pages/guide/faq.mdx`);
  });

  it("returns null when unconfigured", () => {
    expect(editUrlFor(null, inside)).toBeNull();
  });

  it("returns null for a file outside the app", () => {
    expect(editUrlFor(base, "/etc/passwd")).toBeNull();
  });
});

describe("English documentation", () => {
  it("publishes English pages without French routes or links", async () => {
    expect(existsSync(path.join(DIST_DIR, "fr"))).toBe(false);
    const html = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
    expect(html).toContain('<html lang="en"');
    expect(html).not.toContain('hreflang="fr"');
    const headers = await readFile(path.join(DIST_DIR, "_headers"), "utf8");
    expect(headers).not.toContain("/fr");
  });
});
