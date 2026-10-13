import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, type PageHandler, type SsgPlugin } from "./index.js";

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
