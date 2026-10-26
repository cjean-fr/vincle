import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_DIR = path.resolve(import.meta.dirname, "..");
const RECIPE = path.join(PROJECT_DIR, "src/pages/integration/ssg/blog.mdx");
const SITES: string[] = [];

/** The recipe's files, exactly as the page shows them. */
async function recipeFiles(): Promise<Map<string, string>> {
  const source = await readFile(RECIPE, "utf8");
  const files = new Map<string, string>();
  for (const [, title, body] of source.matchAll(/```\w+ title="([^"]+)"\n([\s\S]*?)```/g))
    files.set(title!, body!);
  return files;
}

/** A project inside the app, so the workspace packages resolve, built by the real `ssg generate`. */
async function build(name: string, extra: Record<string, string> = {}) {
  const root = path.join(PROJECT_DIR, `.recipe-${name}-${process.pid}`);
  SITES.push(root);
  for (const [file, body] of [...(await recipeFiles()), ...Object.entries(extra)]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), body);
  }
  await writeFile(path.join(root, "tsconfig.json"), '{ "extends": "../tsconfig.json" }\n');
  await writeFile(
    path.join(root, "ssg.config.ts"),
    'import { defineConfig } from "@vincle/ssg";\nexport default defineConfig({ site: "https://example.com" });\n',
  );
  const proc = Bun.spawnSync(["bun", "run", "--bun", "ssg", "generate"], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { root, ok: proc.success, output: proc.stdout.toString() + proc.stderr.toString() };
}

const read = (root: string, file: string) => readFile(path.join(root, "dist", file), "utf8");

afterAll(async () => {
  await Promise.all(SITES.map((root) => rm(root, { recursive: true, force: true })));
});

describe("blog recipe", () => {
  let site: Awaited<ReturnType<typeof build>>;
  beforeAll(async () => {
    site = await build("ok", {
      "src/pages/blog/edge.md": [
        "---",
        "title: Tom & Jerry <3",
        'date: "2026-05-01"',
        "tags: ['c++ & more']",
        "---",
        "",
        "Edge case.",
      ].join("\n"),
    });
  }, 120_000);

  it("builds the files the page lists", () => {
    expect(site.ok).toBe(true);
    for (const file of [
      "blog/index.html",
      "blog/first-post/index.html",
      "blog/second-post/index.html",
      "blog/tags/intro/index.html",
      "blog/tags/jsx/index.html",
      "feed.xml",
      "sitemap.xml",
    ])
      expect(existsSync(path.join(site.root, "dist", file))).toBe(true);
  });

  it("lists the posts newest first and links their tags", async () => {
    const html = await read(site.root, "blog/index.html");
    const order = ["/blog/edge", "/blog/second-post", "/blog/first-post"].map((u) =>
      html.indexOf(`href="${u}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('href="/blog/tags/intro/"');
  });

  it("writes a page per tag with only that tag's posts", async () => {
    const html = await read(site.root, "blog/tags/intro/index.html");
    expect(html).toContain('href="/blog/first-post"');
    expect(html).not.toContain('href="/blog/second-post"');
  });

  it("encodes a tag that is not URL-safe in the link and the file path", async () => {
    const dir = "blog/tags/c%2B%2B%20%26%20more";
    expect((await read(site.root, "blog/index.html")).includes(`href="/${dir}/"`)).toBe(true);
    expect(await read(site.root, `${dir}/index.html`)).toContain("Tom &amp; Jerry &lt;3");
  });

  it("writes a well-formed feed with escaped titles", async () => {
    const feed = await read(site.root, "feed.xml");
    expect(feed).toContain("<title>Tom &amp; Jerry &lt;3</title>");
    const text = feed.replace(/<\?xml[^>]*\?>/, "").replace(/<\/?[A-Za-z][^<>]*>/g, "");
    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toMatch(/&(?!(amp|lt|gt);)/);
    expect(feed.match(/<item>/g)).toHaveLength(3);
    expect(feed).toContain("<pubDate>Fri, 10 Apr 2026 00:00:00 GMT</pubDate>");
  });

  it("lists the index, the posts and the tag pages in the sitemap, not the feed", async () => {
    const sitemap = await read(site.root, "sitemap.xml");
    expect(sitemap).toContain("<loc>https://example.com/blog/first-post</loc>");
    expect(sitemap).toContain("<loc>https://example.com/blog/tags/jsx/</loc>");
    expect(sitemap).not.toContain("feed.xml");
  });

  it("fails the build, naming the file, for a missing, unquoted or impossible date", async () => {
    const dates = {
      missing: "",
      unquoted: "date: 2026-02-28\n",
      impossible: 'date: "2026-02-30"\n',
      text: 'date: "soon"\n',
    };
    for (const [name, line] of Object.entries(dates)) {
      const result = await build(name, {
        "src/pages/blog/broken.md": `---\ntitle: Broken\n${line}---\n\nText.\n`,
      });
      expect(result.ok).toBe(false);
      expect(result.output).toContain("blog/broken.md: date must be a quoted date");
    }
  }, 120_000);
});
