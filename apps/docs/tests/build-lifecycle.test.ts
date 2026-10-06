import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// A separate process isolates the build engine's configuration and state from
// the full-site tests. All source and output fixtures live in a temporary site.
test("refresh removes deleted and renamed routes while preserving Vite and public files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vincle-docs-lifecycle-"));
  const app = path.resolve(import.meta.dirname, "..");
  const script = `
    import assert from "node:assert/strict";
    import { mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
    import { existsSync } from "node:fs";
    import path from "node:path";
    import config from ${JSON.stringify(path.join(app, "docs.config.ts"))};
    import { rebuildAll, refreshPages } from ${JSON.stringify(path.join(app, "docs-src/lib/build-engine.tsx"))};
    import { createPage } from ${JSON.stringify(path.join(app, "docs-src/lib/page-utils.ts"))};

    const root = ${JSON.stringify(dir)};
    const pages = path.join(root, "docs-src/pages");
    const out = path.join(root, "dist");
    const publicDir = path.join(root, "public");
    await mkdir(pages, { recursive: true });
    await mkdir(path.join(out, "assets/.vite"), { recursive: true });
    await mkdir(publicDir, { recursive: true });
    const manifest = path.join(out, "assets/.vite/manifest.json");
    await writeFile(manifest, "{}");
    await writeFile(path.join(out, "assets/client.js"), "vite asset");
    await writeFile(path.join(publicDir, "favicon.svg"), "public asset");
    Object.assign(config, {
      pages, out, viteManifest: manifest, tabs: [], editUrl: null,
      site: "https://example.test", sitemap: true,
      layout: ({ children }) => children,
      handlers: { ".mdx": { handler: {
        name: "fixture",
        async load(file, pagesDir, config) {
          const text = await readFile(file, "utf8");
          return createPage(file, pagesDir, config, "fixture", { title: path.basename(file) }, () => text);
        },
      } } },
    });
    for (const name of ["index", "deleted", "old-name"])
      await writeFile(path.join(pages, name + ".mdx"), "Content " + name);
    await rebuildAll();
    for (const name of ["deleted", "old-name"])
      for (const ext of ["html", "md"])
        assert.ok(existsSync(path.join(out, name + "." + ext)));

    await rm(path.join(pages, "deleted.mdx"));
    await rename(path.join(pages, "old-name.mdx"), path.join(pages, "new-name.mdx"));
    await refreshPages();
    for (const name of ["deleted", "old-name"])
      for (const ext of ["html", "md"])
        assert.equal(existsSync(path.join(out, name + "." + ext)), false, name + "." + ext + " survived refresh");
    for (const ext of ["html", "md"])
      assert.ok(existsSync(path.join(out, "new-name." + ext)));
    const search = JSON.parse(await readFile(path.join(out, "search-index.json"), "utf8"));
    assert.deepEqual(search.map(page => page.url).sort(), ["/", "/new-name"]);
    const sitemap = await readFile(path.join(out, "sitemap.xml"), "utf8");
    assert.ok(sitemap.includes("https://example.test/new-name"));
    assert.ok(!sitemap.includes("/deleted") && !sitemap.includes("/old-name"));
    assert.equal(await readFile(manifest, "utf8"), "{}");
    assert.equal(await readFile(path.join(out, "assets/client.js"), "utf8"), "vite asset");
    assert.equal(await readFile(path.join(out, "favicon.svg"), "utf8"), "public asset");
    const previousHtml = await readFile(path.join(out, "new-name.html"), "utf8");
    config.layout = () => { throw new Error("render failed"); };
    await assert.rejects(refreshPages(), /render failed/);
    assert.equal(await readFile(path.join(out, "new-name.html"), "utf8"), previousHtml);
    assert.equal(await readFile(path.join(out, "sitemap.xml"), "utf8"), sitemap);

  `;
  try {
    const proc = Bun.spawn(["bun", "--eval", script], { cwd: app, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect({ code, errors: code === 0 ? "" : stdout + stderr }).toEqual({ code: 0, errors: "" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
