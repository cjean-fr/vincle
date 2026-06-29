import { initBuild, rebuildAll } from "./build-engine.js";
import { renderDocument } from "./render-document.js";
import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../..");

beforeAll(async () => {
  if (!existsSync(path.join(PROJECT_DIR, "dist/assets/.vite/manifest.json"))) {
    const proc = Bun.spawnSync(["bun", "run", "build:vite"], {
      cwd: PROJECT_DIR,
    });
    if (!proc.success) throw new Error(proc.stderr.toString());
  }
  await initBuild();
  await rebuildAll();
});

describe("SSG build", () => {
  it("produces index.html", async () => {
    const html = await readFile("dist/index.html", "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("produces robots.txt", async () => {
    const robots = await readFile("dist/robots.txt", "utf-8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });

  it("produces 404.html", async () => {
    const html = await readFile("dist/404.html", "utf-8");
    expect(html).toContain("Page Not Found");
    expect(html).toContain("404");
  });

  it("produces search-index.json (array of entries with body text)", async () => {
    const index = await readFile("dist/search-index.json", "utf-8");
    const data = JSON.parse(index);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("url");
    expect(data[0]).toHaveProperty("title");
    expect(data[0]).toHaveProperty("text");
    const hasBodyText = data.some(
      (d: { text: string }) => d.text && d.text.length > 50,
    );
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
      expect(existsSync(`dist/${page}`)).toBe(true);
    }
  });

  it("injects Vite assets in pages", async () => {
    const html = await readFile("dist/index.html", "utf-8");
    expect(html).toMatch(
      /<script.*?type="module".*?src="\/assets\/client-.*?\.js".*?>/,
    );
    expect(html).toMatch(
      /<link.*?rel="stylesheet".*?href="\/assets\/client-.*?\.css".*?>/,
    );
  });

  it("includes canonical link when config.site is set", async () => {
    const html = await readFile("dist/index.html", "utf-8");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("https://vincle.netlify.app/");
  });

  it("produces llms.txt", async () => {
    const data = await readFile("dist/llms.txt", "utf-8");
    expect(data).toContain("Vincle");
    expect(data).toContain("Installation");
  });

  it("produces security.txt", async () => {
    const data = await readFile("dist/.well-known/security.txt", "utf-8");
    expect(data).toContain("security");
    expect(data).toContain("Contact");
  });

  it("produces manifest.json", async () => {
    const data = await readFile("dist/manifest.json", "utf-8");
    const manifest = JSON.parse(data);
    expect(manifest.name).toBe("Vincle");
    expect(manifest.start_url).toBe("/");
  });

  it("produces 500.html", async () => {
    const html = await readFile("dist/500.html", "utf-8");
    expect(html).toContain("Server Error");
    expect(html).toContain("500");
  });

  it("includes meta tags from specification.website", async () => {
    const html = await readFile("dist/index.html", "utf-8");
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
    const html = await renderDocument(() => (
      <div>{"<script>alert(1)</script>"}</div>
    ));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
