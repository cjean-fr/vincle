import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("published_at controls publication across all outputs and refreshes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vincle-docs-publication-"));
  const app = path.resolve(import.meta.dirname, "..");
  const script = `
    import assert from "node:assert/strict";
    import { mkdir, writeFile, readFile } from "node:fs/promises";
    import { existsSync } from "node:fs";
    import path from "node:path";
    import config from ${JSON.stringify(path.join(app, "docs.config.ts"))};
    import { rebuildAll, refreshPages, getAllPages } from ${JSON.stringify(path.join(app, "docs-src/lib/build-engine.tsx"))};
    import { MdxHandler } from ${JSON.stringify(path.join(app, "docs-src/handlers/mdx.ts"))};

    const root = ${JSON.stringify(dir)};
    const pages = path.join(root, "pages");
    const out = path.join(root, "dist");
    await mkdir(path.join(pages, "guide"), { recursive: true });
    Object.assign(config, {
      pages, out, editUrl: null, site: "https://example.test", sitemap: true,
      tabs: [{ slug: "guide", label: "Guide" }],
      handlers: { ".mdx": { handler: MdxHandler, prose: true } },
    });
    const writePage = (name, header, body) => writeFile(path.join(pages, "guide", name + ".mdx"),
      "---\\ntitle: " + name + "\\n" + header + "---\\n\\n" + body);
    await writeFile(path.join(pages, "index.mdx"), "---\\ntitle: Home\\n---\\n# Home");
    await writePage("ready", "published_at: 2000-01-01\\n", "# Ready\\n\\nReady body.");
    await writePage("today", 'published_at: "' + new Date().toISOString().slice(0, 10) + '"\\n', "# Today");
    await writePage("undated", "", "# Undated");
    // Invalid MDX proves scheduled content is not compiled before publication.
    await writePage("later", 'published_at: "9999-01-01"\\n', "# Scheduled secret\\n\\n{ broken syntax");
    await rebuildAll();
    assert.deepEqual(getAllPages().map(page => page.url).sort(), ["/", "/guide/ready", "/guide/today", "/guide/undated"]);
    for (const ext of ["html", "md"]) assert.equal(existsSync(path.join(out, "guide/later." + ext)), false);
    const html = await readFile(path.join(out, "guide/ready.html"), "utf8");
    assert.ok(!html.includes("docs-page-footer-updated"));
    const home = await readFile(path.join(out, "index.html"), "utf8");
    assert.ok(!home.includes("docs-page-footer-updated"));
    assert.ok(!html.includes("/guide/later"));
    const undated = await readFile(path.join(out, "guide/undated.html"), "utf8");
    assert.ok(!undated.includes("docs-page-footer-updated"));
    const outputs = ["search-index.json", "llms.txt", "llms-full.txt", "sitemap.xml"];
    for (const file of outputs) {
      const text = await readFile(path.join(out, file), "utf8");
      assert.ok(!text.includes("/guide/later") && !text.includes("Scheduled secret"), file);
    }
    await writePage("later", 'published_at: "2000-01-01"\\n', "# Published now");
    await refreshPages();
    for (const ext of ["html", "md"]) assert.ok(existsSync(path.join(out, "guide/later." + ext)));
    for (const file of outputs) assert.ok((await readFile(path.join(out, file), "utf8")).includes("/guide/later"), file);
    assert.ok(!(await readFile(path.join(out, "guide/later.html"), "utf8")).includes("docs-page-footer-updated"));
    await writePage("ready", 'published_at: "9999-01-01"\\n', "# Rescheduled");
    await refreshPages();
    for (const ext of ["html", "md"]) assert.equal(existsSync(path.join(out, "guide/ready." + ext)), false);
    for (const file of outputs) assert.ok(!(await readFile(path.join(out, file), "utf8")).includes("/guide/ready"), file);
    const before = await readFile(path.join(out, "guide/later.html"), "utf8");
    await writePage("later", 'published_at: "invalid"\\n', "# Invalid date");
    await assert.rejects(refreshPages(), /later.mdx: published_at must be an ISO date/);
    assert.equal(await readFile(path.join(out, "guide/later.html"), "utf8"), before);
  `;
  try {
    const proc = Bun.spawn([process.execPath, "--eval", script], {
      cwd: app,
      stdout: "pipe",
      stderr: "pipe",
    });
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
