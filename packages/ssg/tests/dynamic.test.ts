import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, discoverPages } from "../src/index.js";

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

const read = (root: string, name: string) => readFile(path.join(root, "dist", name), "utf8");

test("a [param] page builds one page per paths entry, inside its layout, with its own meta", () =>
  fixture(async (root, put) => {
    await put(
      "_layout.tsx",
      "export default ({ children, meta, params }) => <html><head><title>{meta.title}</title></head><body data-id={params.id ?? 'none'}>{children}</body></html>",
    );
    await put("index.tsx", "export default () => <p>home</p>");
    await put(
      "item/[id].tsx",
      `export const meta = { title: "Item" };
       export const paths = async () => [
         { params: { id: 1 }, meta: { title: "First" } },
         { params: { id: "two words" } },
       ];
       export default ({ params, route }) => <p>{params.id} at {route}</p>;`,
    );
    const { files } = await build({ root, assets: false, site: "https://example.com" });
    expect(await read(root, "item/1/index.html")).toBe(
      '<html><head><title>First</title></head><body data-id="1"><p>1 at /item/1</p></body></html>',
    );
    expect(await read(root, "item/two words/index.html")).toContain("<title>Item</title>");
    expect(await read(root, "index.html")).toContain('data-id="none"');
    expect(files).not.toContain("item/[id]/index.html");
    const sitemap = await read(root, "sitemap.xml");
    expect(sitemap).toContain("https://example.com/item/1");
    expect(sitemap).toContain("https://example.com/item/two%20words");
  }));

test("an iterable paths export, several parameters and file outputs work", () =>
  fixture(async (root, put) => {
    await put(
      "[lang]/[slug].json.ts",
      `export const paths = [{ params: { lang: "en", slug: "a" } }, { params: { lang: "fr", slug: "b" } }];
       export default ({ params }) => JSON.stringify(params);`,
    );
    await put(
      "tag/[name].tsx",
      `export async function* paths() { yield { params: { name: "x" } }; }
       export default ({ params, outputPath }) => <p>{outputPath(".json")}:{params.name}</p>;
       export const outputs = ({ params, outputPath }) => ({ path: outputPath(".json"), content: params.name });`,
    );
    await build({ root, assets: false });
    expect(JSON.parse(await read(root, "en/a.json"))).toEqual({ lang: "en", slug: "a" });
    expect(JSON.parse(await read(root, "fr/b.json"))).toEqual({ lang: "fr", slug: "b" });
    expect(await read(root, "tag/x/index.html")).toContain("tag/x.json:x");
    expect(await read(root, "tag/x.json")).toBe("x");
  }));

test("discovery lists the expanded pages with params, and static pages get empty params", () =>
  fixture(async (root, put) => {
    await put("a.tsx", "export default () => <p>a</p>");
    await put(
      "p/[id].tsx",
      "export const paths = () => [{ params: { id: 'z' } }]; export default () => <p />",
    );
    const pages = await discoverPages({ src: path.join(root, "src") });
    expect(pages.map((page) => [page.source.route, page.source.params])).toEqual([
      ["/a", {}],
      ["/p/z", { id: "z" }],
    ]);
    expect(pages[1]!.source.outputPath()).toBe("p/z/index.html");
  }));

test.each([
  ["no paths export", "export default () => <p />", "without a paths export"],
  ["markdown", null, "without a paths export"],
  [
    "missing parameter",
    "export const paths = () => [{ params: {} }]; export default () => <p />",
    "missing id",
  ],
  [
    "unknown parameter",
    "export const paths = () => [{ params: { id: 1, x: 2 } }]; export default () => <p />",
    "unknown x",
  ],
  [
    "slash in value",
    "export const paths = () => [{ params: { id: 'a/b' } }]; export default () => <p />",
    "route parameter [id]",
  ],
  [
    "dot-dot value",
    "export const paths = () => [{ params: { id: '..' } }]; export default () => <p />",
    "route parameter [id]",
  ],
  [
    "empty value",
    "export const paths = () => [{ params: { id: '' } }]; export default () => <p />",
    "route parameter [id]",
  ],
  [
    "duplicate entries",
    "export const paths = () => [{ params: { id: 1 } }, { params: { id: '1' } }]; export default () => <p />",
    "same route: /x/1",
  ],
  [
    "no params object",
    "export const paths = () => [{ id: 1 }]; export default () => <p />",
    "needs a params object",
  ],
])("a dynamic route fails with a clear error: %s", (_name, code, message) =>
  fixture(async (root, put) => {
    if (code === null) await put("x/[id].md", "# hi");
    else await put("x/[id].tsx", code);
    await expect(build({ root, assets: false })).rejects.toThrow(message);
  }),
);

test("two dynamic pages that build the same file fail the build", () =>
  fixture(async (root, put) => {
    await put(
      "x/[id].tsx",
      "export const paths = () => [{ params: { id: 'a' } }]; export default () => <p />",
    );
    await put("x/a.tsx", "export default () => <p />");
    await expect(build({ root, assets: false })).rejects.toThrow("collision");
  }));
