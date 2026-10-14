import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build } from "./index.js";
import { viteAssets } from "./vite.js";

test("Vite publishes hashed JS/CSS with pages, installs the manifest, and retains assets on failure", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-vite-test-"));
  try {
    const src = path.join(root, "src");
    await mkdir(path.join(src, "_client"), { recursive: true });
    await writeFile(
      path.join(src, "_client/main.ts"),
      'import "./style.css"; console.log("asset test");',
    );
    await writeFile(path.join(src, "_client/style.css"), "body { color: red }");
    await writeFile(
      path.join(src, "index.tsx"),
      'import {Asset} from "@vincle/vite-plugin"; export default () => <html><head><Asset entry="src/_client/main.ts" /></head><body>Hello</body></html>',
    );
    const assets = viteAssets({
      configFile: false,
      logLevel: "silent",
      base: "/docs/",
      build: { rolldownOptions: { input: path.join(src, "_client/main.ts") } },
    });
    const first = await build({ root, assets });
    const html = await readFile(path.join(root, "dist/index.html"), "utf8");
    const references = [...html.matchAll(/(?:src|href)="\/docs\/([^"]+)"/g)].map(
      (match) => match[1]!,
    );
    expect(references.some((name) => name.endsWith(".js"))).toBe(true);
    expect(references.some((name) => name.endsWith(".css"))).toBe(true);
    for (const name of references) expect(first.files).toContain(name);
    const previousAssets = await Promise.all(
      references.map((name) => readFile(path.join(root, "dist", name), "utf8")),
    );
    await writeFile(path.join(src, "_client/style.css"), "body { color: blue }");
    await writeFile(
      path.join(src, "index.tsx"),
      'export default () => { throw new Error("render failed") }',
    );
    await expect(build({ root, assets })).rejects.toThrow("render failed");
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe(html);
    expect(
      await Promise.all(references.map((name) => readFile(path.join(root, "dist", name), "utf8"))),
    ).toEqual(previousAssets);
    await writeFile(path.join(src, "index.tsx"), "export default () => <p>Updated</p>");
    const next = await build({ root, assets });
    expect(next.files.filter((name) => name.endsWith(".css"))).not.toEqual(
      first.files.filter((name) => name.endsWith(".css")),
    );
    for (const obsolete of first.files.filter((name) => name.endsWith(".css")))
      expect(await Bun.file(path.join(root, "dist", obsolete)).exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("private script and stylesheet entries enable Vite automatically without configuration", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-vite-convention-"));
  try {
    await mkdir(path.join(root, "src/_client"), { recursive: true });
    await writeFile(path.join(root, "src/_client/main.ts"), 'console.log("convention");');
    await writeFile(path.join(root, "src/_client/main.css"), "body { color: tomato }");
    await mkdir(path.join(root, "src/pages"));
    await writeFile(
      path.join(root, "src/pages/index.tsx"),
      'import {Asset} from "@vincle/vite-plugin"; export default () => <><Asset entry="src/_client/main.ts" /><Asset entry="src/_client/main.css" /></>',
    );
    await mkdir(path.join(root, "public"));
    await writeFile(path.join(root, "public/favicon.svg"), "icon");
    const result = await build({ root });
    expect(result.files.some((name) => /^assets\/main-.*\.js$/.test(name))).toBe(true);
    expect(result.files.some((name) => /^assets\/main-.*\.css$/.test(name))).toBe(true);
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toContain(
      'rel="stylesheet"',
    );
    expect(result.files).toContain("favicon.svg");
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toContain('src="/assets/');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Vite normalizes legacy rollupOptions configuration to rolldownOptions", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-vite-legacy-"));
  try {
    await mkdir(path.join(root, "src/_client"), { recursive: true });
    await writeFile(path.join(root, "src/_client/entry.ts"), 'console.log("configured entry");');
    await writeFile(
      path.join(root, "src/index.tsx"),
      'import {Asset} from "@vincle/vite-plugin"; export default () => <Asset entry="src/_client/entry.ts" />',
    );
    await writeFile(
      path.join(root, "vite.config.mjs"),
      `export default {logLevel:"silent",build:{rollupOptions:{input:${JSON.stringify(path.join(root, "src/_client/entry.ts"))}}}};`,
    );
    const result = await build({ root });
    expect(result.files.some((name) => /^assets\/entry-.*\.js$/.test(name))).toBe(true);
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toContain(
      'src="/assets/entry-',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pages, layouts, MDX and assets share aliases, build plugins and one source module graph", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-vite-shared-"));
  try {
    await mkdir(path.join(root, "src/_client"), { recursive: true });
    await mkdir(path.join(root, "src/_shared"));
    await writeFile(
      path.join(root, "src/_shared/value.ts"),
      'export const value="__TOKEN__"; let count=0; export const next=()=>++count;',
    );
    await writeFile(
      path.join(root, "src/_client/main.ts"),
      'import {value} from "@shared/value"; console.log(value);',
    );
    await writeFile(
      path.join(root, "src/_layout.tsx"),
      'import {value} from "@shared/value"; export default ({children})=><section data-value={value}>{children}</section>',
    );
    for (const name of ["a", "b"])
      await writeFile(
        path.join(root, `src/${name}.tsx`),
        'import {value,next} from "@shared/value"; export default ()=><p>{value}:{next()}</p>',
      );
    await writeFile(
      path.join(root, "src/article.mdx"),
      'import {value} from "@shared/value"\n\n# Article\n\n{value}',
    );
    const assets = viteAssets({
      configFile: false,
      logLevel: "silent",
      resolve: { alias: { "@shared": path.join(root, "src/_shared") } },
      plugins: [
        {
          name: "production-marker",
          apply: "build",
          transform(code) {
            return code.replaceAll("__TOKEN__", "shared-production");
          },
        },
      ],
    });
    const result = await build({ root, assets });
    expect(await readFile(path.join(root, "dist/a/index.html"), "utf8")).toBe(
      '<section data-value="shared-production"><p>shared-production:1</p></section>',
    );
    expect(await readFile(path.join(root, "dist/b/index.html"), "utf8")).toContain(
      "shared-production:2",
    );
    expect(await readFile(path.join(root, "dist/article/index.html"), "utf8")).toContain(
      "shared-production",
    );
    const client = result.files.find((name) => /^assets\/main-.*\.js$/.test(name))!;
    expect(await readFile(path.join(root, "dist", client), "utf8")).toContain("shared-production");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Vite configuration can serve page compilation without a browser entry", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-vite-source-only-"));
  try {
    await mkdir(path.join(root, "src/_shared"), { recursive: true });
    await writeFile(path.join(root, "src/_shared/title.ts"), 'export const title="source-only";');
    await writeFile(
      path.join(root, "src/index.tsx"),
      'import {title} from "@shared/title"; export default ()=><h1>{title}</h1>;',
    );
    await writeFile(
      path.join(root, "vite.config.mjs"),
      `export default {logLevel:"silent",resolve:{alias:{"@shared":${JSON.stringify(path.join(root, "src/_shared"))}}}};`,
    );
    expect((await build({ root })).files).toEqual(["index.html"]);
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe("<h1>source-only</h1>");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installed Tailwind is automatic, scans server pages and removes obsolete utilities and assets", async () => {
  // This consumer owns Tailwind; SSG resolves its plugin from that project.
  const root = await mkdtemp(
    path.resolve(import.meta.dirname, "../../../apps/docs/.ssg-tailwind-test-"),
  );
  try {
    await mkdir(path.join(root, "src/_client"), { recursive: true });
    await writeFile(path.join(root, "src/_client/main.css"), '@import "tailwindcss";');
    const page = path.join(root, "src/index.tsx");
    await writeFile(page, 'export default () => <main class="p-[137px]">Tailwind</main>');
    const assets = viteAssets({ configFile: false, logLevel: "silent" });
    const first = await build({ root, assets });
    const oldCss = first.files.find((file) => file.endsWith(".css"))!;
    const css = await readFile(path.join(root, "dist", oldCss), "utf8");
    expect(css).toContain("137px");
    expect(css).not.toContain("padding:139px");
    expect(css).not.toContain('@import "tailwindcss"');
    await writeFile(page, 'export default () => <main class="p-[139px]">Updated</main>');
    const second = await build({ root, assets });
    const newCss = second.files.find((file) => file.endsWith(".css"))!;
    expect(newCss).not.toBe(oldCss);
    const updated = await readFile(path.join(root, "dist", newCss), "utf8");
    expect(updated).toContain("139px");
    expect(updated).not.toContain("137px");
    await expect(readFile(path.join(root, "dist", oldCss))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
