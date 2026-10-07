import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSitemap } from "./build-sitemap.js";

it("applies the deployment base to locations and all translation alternates", async () => {
  const out = await mkdtemp(join(tmpdir(), "vincle-sitemap-"));
  try {
    await buildSitemap(
      [
        {
          url: "/fr/guide",
          alternates: [
            { locale: "en", href: "/guide" },
            { locale: "fr", href: "/fr/guide" },
          ],
        },
        { url: "/draft", draft: true },
      ],
      "https://example.test/project/",
      out,
      "/docs/",
    );
    const xml = await readFile(join(out, "sitemap.xml"), "utf8");
    expect(xml).toContain("<loc>https://example.test/project/docs/fr/guide</loc>");
    expect(xml).toContain('hreflang="en" href="https://example.test/project/docs/guide"');
    expect(xml).toContain('hreflang="fr" href="https://example.test/project/docs/fr/guide"');
    expect(xml).toContain('hreflang="x-default" href="https://example.test/project/docs/guide"');
    expect(xml).not.toContain("draft");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
