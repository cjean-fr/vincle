import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, discoverPages, type PageHandler, type SsgPlugin } from "../src/index.js";

async function fixture(
  run: (root: string, put: (name: string, content: string) => Promise<void>) => Promise<void>,
) {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-test-"));
  const put = async (name: string, content: string) => {
    const file = path.join(root, "src", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  try {
    await run(root, put);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const file = (root: string, name: string) => readFile(path.join(root, "dist", name), "utf8");

test("build consumes pages in discovery order without mutating the caller's catalog", () =>
  fixture(async (root, put) => {
    await put("a.fixture", "");
    await put("b.fixture", "");
    const seen: string[] = [];
    const catalog = Object.freeze(
      await discoverPages({
        src: path.join(root, "src"),
        handlers: {
          ".fixture": {
            name: "fixture",
            load: ({ route }) => ({
              meta: { title: route },
              render: ({ outputPath }) => ({ path: outputPath(), content: route }),
            }),
          },
        },
      }),
    );
    await build({
      root,
      assets: false,
      discover: () => catalog,
      plugins: [
        {
          name: "observe-order",
          metadata: ({ meta }) => {
            seen.push(meta.title!);
          },
        },
      ],
    });
    expect(seen).toEqual(["/a", "/b"]);
    expect(catalog.map((page) => page.source.route)).toEqual(["/a", "/b"]);
    for (const page of catalog) {
      const output = await page.render({ ...page.source, meta: page.meta });
      expect(output).toMatchObject({ content: page.source.route });
    }
  }));

test("all default formats, file routes, multiple outputs and source Markdown", () =>
  fixture(async (root, put) => {
    await put("index.tsx", "export default async () => <main>Hello & welcome</main>");
    await put("guide/index.md", "---\ntitle: Guide\n---\n# Guide\n\n**Bold**");
    await put(
      "guide/article.mdx",
      '---\ntitle: Article\n---\nexport const meta = {description: "MDX"}\n\n# Article\n\n<span>JSX</span>',
    );
    await put("hello.jsx", "export default () => <p>JSX file</p>");
    await put("robots.txt.js", 'export default "User-agent: *"');
    await put("data.json.ts", "export default () => JSON.stringify({ok: true})");
    await put(
      "images/photo.ts",
      "export default function* ({route}) { for (const size of [100, 200]) yield {path: `${route.slice(1)}-${size}.jpg`, content: new Uint8Array([255,216,size,255,217])} }",
    );
    await put("_helpers/unused.ts", 'throw new Error("not a route")');
    await put("ignored.test.ts", 'throw new Error("not a route")');
    const result = await build({ root });
    expect(result.files).toEqual([
      "data.json",
      "guide.md",
      "guide/article.md",
      "guide/article/index.html",
      "guide/index.html",
      "hello/index.html",
      "images/photo-100.jpg",
      "images/photo-200.jpg",
      "index.html",
      "robots.txt",
    ]);
    expect(await file(root, "index.html")).toBe("<main>Hello &amp; welcome</main>");
    expect(await file(root, "guide/index.html")).toContain("<strong>Bold</strong>");
    expect(await file(root, "guide/article/index.html")).toContain("<span>JSX</span>");
    expect(await file(root, "guide/article.md")).toContain("export const meta");
    expect(await file(root, "hello/index.html")).toBe("<p>JSX file</p>");
    expect(JSON.parse(await file(root, "data.json"))).toEqual({ ok: true });
    expect(await file(root, "robots.txt")).toBe("User-agent: *");
    expect([...(await readFile(path.join(root, "dist/images/photo-100.jpg")))]).toEqual([
      255, 216, 100, 255, 217,
    ]);
  }));

test("metadata shared by formats, handlers and plugins controls sitemap per source and output", () =>
  fixture(async (root, put) => {
    await put(
      "index.tsx",
      'export const meta = {title:"Home",tag:"module"}; export default ({meta}) => <h1>{meta.title}</h1>',
    );
    await put("private.mdx", "---\ntitle: Private\nsitemap: false\ntag: markdown\n---\n# Secret");
    await put("plugin.md", "---\ntitle: Plugin\n---\n# Plugin");
    await put("shorthand.jsx", "export const sitemap = false; export default () => <p>Hidden</p>");
    await put("custom.pt", "{}");
    const seen: string[] = [];
    const handler: PageHandler = {
      name: "custom",
      load: () => ({
        meta: { title: "Custom", tag: "portable-text" },
        render: (context) => [
          {
            path: context.outputPath(),
            content: () => `${context.meta.title} ${context.meta["shared"]}`,
          },
          { path: context.outputPath(".json"), content: "{}", sitemap: true },
          { path: "private-variant.html", content: "private", sitemap: false },
        ],
      }),
    };
    const plugin: SsgPlugin = {
      name: "metadata",
      metadata(context) {
        seen.push(String(context.meta.title));
        context.meta["shared"] = "enriched";
        if (context.meta.title === "Plugin") context.meta.sitemap = false;
      },
      transform(output, context) {
        expect(context.meta["shared"]).toBe("enriched");
        return output;
      },
    };
    await build({
      root,
      site: "https://example.com/docs/",
      handlers: { ".pt": handler },
      plugins: [plugin],
    });
    expect(seen.toSorted()).toEqual(
      ["Custom", "Home", "Plugin", "Private", "undefined"].toSorted(),
    );
    expect(await file(root, "custom/index.html")).toBe("Custom enriched");
    const sitemap = await file(root, "sitemap.xml");
    expect(sitemap).toContain("https://example.com/docs/custom/");
    expect(sitemap).toContain("https://example.com/docs/custom.json");
    expect(sitemap).toContain("<loc>https://example.com/docs/</loc>");
    expect(sitemap).not.toContain("private");
    expect(sitemap).not.toContain("plugin");
    expect(sitemap).not.toContain("shorthand");
    expect(sitemap).not.toContain(".md<");
  }));

test("one configurable runtime compiles JSX, TSX, MDX and imported components", () =>
  fixture(async (root, put) => {
    await put(
      "_runtime/jsx-runtime.ts",
      'export const Fragment = "fragment"; export function jsx(type, props) { if (typeof type === "function") return type(props); const children = Array.isArray(props.children) ? props.children.join("") : (props.children ?? ""); return `<alternate-${type}>${children}</alternate-${type}>`; } export const jsxs = jsx;',
    );
    await put("_components/Label.tsx", "export const Label = () => <b>component</b>");
    await put(
      "jsx.jsx",
      'import {Label} from "./_components/Label.tsx"; export default () => <div><Label /></div>',
    );
    await put("tsx.tsx", "export default () => <p>TSX</p>");
    await put("mdx.mdx", "# MDX");
    await build({
      root,
      runtime: {
        importSource: path.join(root, "src/_runtime"),
        render: (create) => String(create()),
      },
    });
    expect(await file(root, "jsx/index.html")).toBe(
      "<alternate-div><alternate-b>component</alternate-b></alternate-div>",
    );
    expect(await file(root, "tsx/index.html")).toBe("<alternate-p>TSX</alternate-p>");
    expect(await file(root, "mdx/index.html")).toBe("<alternate-h1>MDX</alternate-h1>");
  }));

test("source changes reload and failure, collisions and traversal retain previous publication", () =>
  fixture(async (root, put) => {
    await put("index.ts", 'export default "original"');
    await build({ root });
    await put("index.ts", 'export default "changed"');
    await build({ root });
    expect(await file(root, "index.html")).toBe("changed");
    await put("broken.ts", 'export default () => { throw new Error("source failed") }');
    await expect(build({ root })).rejects.toThrow("broken.ts");
    expect(await file(root, "index.html")).toBe("changed");
    await rm(path.join(root, "src/broken.ts"));
    await put("index.md", "# Collision");
    await expect(build({ root })).rejects.toThrow("collision");
    await rm(path.join(root, "src/index.md"));
    await put("escape.ts", 'export default {path:"../escape",content:"bad"}');
    await expect(build({ root })).rejects.toThrow("Invalid relative output path");
    expect(await file(root, "index.html")).toBe("changed");
  }));

test("a helper module without a default export points at the _ prefix escape", () =>
  fixture(async (root, put) => {
    await put("helper.ts", "export const value = 1;");
    const error = await build({ root }).then(
      () => Promise.reject(new Error("build should have failed")),
      (caught: unknown) => caught,
    );
    expect((error as Error).message).toContain("No default export");
    expect((error as { hint?: string }).hint).toContain("_");
  }));

test("configuration and metadata validation", () =>
  fixture(async (root, put) => {
    await expect(build({ root, out: "src/dist" })).rejects.toThrow("directories");
    await expect(build({ root, site: "javascript:alert(1)" })).rejects.toThrow("HTTP(S)");
    await expect(build({ root, handlers: { md: false } })).rejects.toThrow("extension");
    await put("bad.ts", 'export const meta = {sitemap:"false"}; export default "bad"');
    await expect(build({ root })).rejects.toThrow("boolean");
    await build({ root, handlers: { ".ts": false }, site: "https://example.com", sitemap: false });
    expect(await Bun.file(path.join(root, "dist/sitemap.xml")).exists()).toBe(false);
  }));

test("site is the origin and base the path prefix of sitemap URLs", () =>
  fixture(async (root, put) => {
    await put("index.tsx", "export default () => <p>Home</p>");
    await put("guide/intro.tsx", "export default () => <p>Intro</p>");
    await build({ root, site: "https://example.com", base: "docs", assets: false });
    const sitemap = await file(root, "sitemap.xml");
    expect(sitemap).toContain("<loc>https://example.com/docs/</loc>");
    expect(sitemap).toContain("<loc>https://example.com/docs/guide/intro/</loc>");
    expect(await file(root, "guide/intro/index.html")).toBe("<p>Intro</p>");
    await expect(
      build({ root, site: "https://example.com/docs/", base: "/docs/", assets: false }),
    ).rejects.toThrow("origin when base is set");
    for (const base of ["/docs/../x", "https://cdn.example/", "//cdn.example/", "/a?b"])
      await expect(build({ root, base, assets: false })).rejects.toMatchObject({
        reason: "INVALID_CONFIG",
      });
  }));

test("nearest layouts, page overrides and opt-out share metadata and leave alternate outputs alone", () =>
  fixture(async (root, put) => {
    await put(
      "_layout.tsx",
      "export default ({children,meta}) => <html><head><title>{meta.title}</title></head><body>{children}</body></html>",
    );
    await put(
      "index.tsx",
      'export const meta = {title:"Home"}; export default () => <h1>Home</h1>',
    );
    await put(
      "nested/_layout.tsx",
      "export default async ({children,meta}) => <article data-title={meta.title}>{children}</article>",
    );
    await put("nested/page.md", "---\ntitle: Nested\n---\n# Nested");
    await put("nested/deeper/page.mdx", "# Deep");
    await put("_layouts/plain.tsx", "export default ({children}) => <section>{children}</section>");
    await put("nested/override.mdx", "---\nlayout: ../_layouts/plain.tsx\n---\n# Override");
    await put("bare.jsx", "export const meta = {layout:false}; export default () => <p>Bare</p>");
    await build({ root });
    expect(await file(root, "index.html")).toBe(
      "<html><head><title>Home</title></head><body><h1>Home</h1></body></html>",
    );
    expect(await file(root, "nested/page/index.html")).toContain(
      '<article data-title="Nested"><h1>Nested</h1>',
    );
    expect(await file(root, "nested/deeper/page/index.html")).toBe(
      "<article><h1>Deep</h1></article>",
    );
    expect(await file(root, "nested/override/index.html")).toBe(
      "<section><h1>Override</h1></section>",
    );
    expect(await file(root, "bare/index.html")).toBe("<p>Bare</p>");
    expect(await file(root, "nested/page.md")).toBe("---\ntitle: Nested\n---\n# Nested");

    // Missing and present layout probes must not survive into the next build.
    await rm(path.join(root, "src/nested/_layout.tsx"));
    await build({ root, assets: false });
    expect(await file(root, "nested/page/index.html")).toContain("<html><head>");
    await put("nested/_layout.jsx", "export default ({children}) => <main>{children}</main>");
    await build({ root, assets: false });
    expect(await file(root, "nested/page/index.html")).toContain("<main><h1>Nested</h1>");
  }));

test("shared layout discovery keeps custom module loaders isolated", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", "// Resolved by the custom module loaders.");
    await put("first.md", "# First");
    await put("second.md", "# Second");
    const pages = await discoverPages({ src: path.join(root, "src") });
    for (const page of pages) {
      const label = page.source.route;
      page.source.modules = {
        async load() {
          return { default: ({ children }: { children: unknown }) => [label, children] };
        },
      };
    }
    await build({ root, assets: false, discover: () => pages });
    expect(await file(root, "first/index.html")).toBe("/first<h1>First</h1>");
    expect(await file(root, "second/index.html")).toBe("/second<h1>Second</h1>");
  }));

test("public assets and resource paths follow conventions", () =>
  fixture(async (root, put) => {
    await mkdir(path.join(root, "public"));
    await writeFile(path.join(root, "public/favicon.svg"), "icon");
    await put("resource.txt", "resource");
    await put(
      "read.ts",
      'import {readFile} from "node:fs/promises"; export default async () => ({path:"resource.txt",content:await readFile(new URL("./resource.txt", import.meta.url))})',
    );
    await build({ root });
    expect(await file(root, "favicon.svg")).toBe("icon");
    expect(await file(root, "resource.txt")).toBe("resource");
  }));

test("imported helpers resolve resources relative to their own source", () =>
  fixture(async (root, put) => {
    await put("_helpers/resource.txt", "helper resource");
    await put(
      "_helpers/read.ts",
      'import {readFile} from "node:fs/promises"; export const read = () => readFile(new URL("./resource.txt",import.meta.url));',
    );
    await put(
      "page.ts",
      'import {read} from "./_helpers/read.ts"; export default async () => ({path:"helper.txt",content:await read()});',
    );
    await build({ root });
    expect(await file(root, "helper.txt")).toBe("helper resource");
  }));

test("JSX and MDX pages can export additional outputs using the same metadata", () =>
  fixture(async (root, put) => {
    await put(
      "page.tsx",
      'export const meta = {title:"Page"}; export default () => <p>Page</p>; export const outputs = ({outputPath,meta}) => ({path:outputPath(".json"),content:JSON.stringify(meta)});',
    );
    await put(
      "article.mdx",
      'export const outputs = ({outputPath}) => [{path:outputPath(".txt"),content:"alternate"}]\n\n# Article',
    );
    await build({ root });
    expect(JSON.parse(await file(root, "page.json"))).toEqual({ title: "Page" });
    expect(await file(root, "page/index.html")).toBe("<p>Page</p>");
    expect(await file(root, "article.txt")).toBe("alternate");
    expect(await file(root, "article.md")).toContain("# Article");
  }));

test("binary/text producers do not evaluate unused JSX layouts", () =>
  fixture(async (root, put) => {
    await put(
      "_layout.tsx",
      'throw new Error("unused layout"); export default ({children}) => children;',
    );
    await put("data.json.ts", 'export default "{}"');
    await build({ root });
    expect(await file(root, "data.json")).toBe("{}");
  }));

test("fallback compilation retains consumer tsconfig path aliases", () =>
  fixture(async (root, put) => {
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@shared/*": ["src/_shared/*"] },
          jsx: "react-jsx",
          jsxImportSource: "@vincle/core",
        },
      }),
    );
    await put("_shared/title.ts", 'export const title="configured alias";');
    await put(
      "index.tsx",
      'import {title} from "@shared/title"; export default ()=><h1>{title}</h1>;',
    );
    await build({ root });
    expect(await file(root, "index.html")).toBe("<h1>configured alias</h1>");
  }));

test("search integrations consume final HTML and sitemap connects existing translations", () =>
  fixture(async (root, put) => {
    await put(
      "welcome.tsx",
      'export const meta = {title:"Welcome",locale:"en",translationKey:"intro"}; export default () => <main>Hello</main>',
    );
    await put(
      "fr/bienvenue.tsx",
      'export const meta = {title:"Bienvenue",locale:"fr",translationKey:"intro"}; export default () => <main>Bonjour</main>',
    );
    await put(
      "fr/seul.tsx",
      'export const meta = {locale:"fr",translationKey:"only-fr",search:false}; export default () => <main>Seul</main>',
    );
    await put(
      "hidden.tsx",
      "export const meta = {sitemap:false,search:false}; export default () => <main>Hidden</main>",
    );
    await put("_layout.tsx", "export default ({children}) => <html>{children}</html>");
    const search: SsgPlugin = {
      name: "search",
      async publish(context) {
        const documents = [];
        for (const page of context.outputs)
          if (page.meta.search !== false)
            documents.push({
              url: page.url,
              title: page.meta.title,
              locale: page.meta.locale,
              html: await page.read(),
            });
        await context.emit({ path: "search.json", content: JSON.stringify(documents) });
      },
    };
    const options = {
      root,
      site: "https://example.com/docs/",
      i18n: { locales: ["en", "fr"], defaultLocale: "en" },
      plugins: [search],
    };
    await build(options);
    const documents = JSON.parse(await file(root, "search.json"));
    expect(documents).toHaveLength(2);
    expect(documents.find((doc: { locale: string }) => doc.locale === "fr")).toEqual({
      url: "/fr/bienvenue/",
      title: "Bienvenue",
      locale: "fr",
      html: "<html><main>Bonjour</main></html>",
    });
    const xml = await file(root, "sitemap.xml");
    const entries = [...xml.matchAll(/<url>(.*?)<\/url>/g)].map((match) => match[1]!);
    expect(entries).toHaveLength(3);
    for (const entry of entries.filter(
      (candidate) => !candidate.includes("<loc>https://example.com/docs/fr/seul/"),
    )) {
      expect(entry).toContain('hreflang="en" href="https://example.com/docs/welcome/"');
      expect(entry).toContain('hreflang="fr" href="https://example.com/docs/fr/bienvenue/"');
      expect(entry).toContain('hreflang="x-default" href="https://example.com/docs/welcome/"');
    }
    expect(
      entries.find((entry) => entry.includes("<loc>https://example.com/docs/fr/seul/")),
    ).not.toContain("x-default");
    expect(xml).not.toContain("hidden");
    await put(
      "duplicate.tsx",
      'export const meta={locale:"en",translationKey:"intro"};export default () => <p>Duplicate</p>',
    );
    await expect(build(options)).rejects.toThrow("Duplicate translation");
    expect(await file(root, "sitemap.xml")).toBe(xml);
    await expect(
      build({ ...options, i18n: { locales: ["en"], defaultLocale: "fr" } }),
    ).rejects.toThrow("Invalid i18n configuration");
  }));

test("src/pages isolates routes from sibling helpers and explicit src retains priority", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", "export default ({children}) => <html>{children}</html>");
    await put("pages/index.tsx", "export default () => <main>pages convention</main>");
    await put("components/Broken.tsx", 'throw new Error("helper must not be discovered");');
    await put("other/index.tsx", "export default () => <main>explicit source</main>");
    await build({ root, assets: false });
    expect(await file(root, "index.html")).toBe("<html><main>pages convention</main></html>");
    expect(await build({ root, src: "src/other", assets: false })).toEqual({
      files: ["index.html"],
    });
    expect(await file(root, "index.html")).toBe("<main>explicit source</main>");
  }));

test("build returns the written files", () =>
  fixture(async (root, put) => {
    await put("index.tsx", "export default () => <main>Home</main>");
    const result = await build({ root, assets: false });
    expect(result).toEqual({ files: ["index.html"] });
  }));

test("linked sources keep link-located routes and resolve imports from their target", () =>
  fixture(async (root, put) => {
    const external = path.join(root, "external");
    await mkdir(external);
    await writeFile(
      path.join(external, "page.tsx"),
      'import {label} from "./_label"; export default () => <p>{label}</p>',
    );
    await writeFile(path.join(external, "_label.ts"), 'export const label = "target";');
    await put("_label.ts", 'export const label = "link";');
    await symlink("../external/page.tsx", path.join(root, "src/linked.tsx"));
    await symlink("../external", path.join(root, "src/directory"));
    expect(
      (await discoverPages({ src: path.join(root, "src") })).map((page) => page.source.route),
    ).toEqual(["/directory/page", "/linked"]);
    await build({ root, assets: false });
    expect(await file(root, "linked/index.html")).toBe("<p>target</p>");
    expect(await file(root, "directory/page/index.html")).toBe("<p>target</p>");
  }));
