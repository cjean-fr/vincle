import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, SsgError } from "../src/index.js";
import { ogImagePath } from "../src/og-image.js";

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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const LAYOUT = `export default ({ children, meta }) => (
  <html>
    <head>{meta.image ? <meta property="og:image" content={meta.image} /> : null}</head>
    <body>{children}</body>
  </html>
)`;

const CARD = `export default ({ title }) => (
  <div style={{ display: "flex", width: "100%", height: "100%", background: "#fff" }}>
    <span>{title ?? "untitled"}</span>
  </div>
)`;

function expectPng(bytes: Uint8Array) {
  expect([...bytes.subarray(0, 4)]).toEqual(PNG_SIGNATURE);
}

test("ogImagePath maps routes to stable card paths", () => {
  expect(ogImagePath("/")).toBe("og.png");
  expect(ogImagePath("/guide")).toBe("guide/og.png");
  expect(ogImagePath("/guide/")).toBe("guide/og.png");
  expect(ogImagePath("/guide", "card")).toBe("guide/og-card.png");
});

test("the nearest _og-image module covers the subtree and sets meta.image before render", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", CARD);
    await put("index.tsx", "export default () => <main>Home</main>");
    await put(
      "guide/index.tsx",
      'export const meta = { title: "Guide" }\nexport default () => <main>Guide</main>',
    );
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "guide", "og.png"))));
    const html = await readFile(path.join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('content="/og.png"');
  }));

test("a nested _og-image replaces its ancestor and meta.ogImage selects or disables", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", `export default () => <div style={{ display: "flex" }}>root</div>`);
    await put("index.tsx", "export default () => <main>Home</main>");
    await put(
      "plain/index.tsx",
      "export const meta = { ogImage: false }\nexport default () => <main>Plain</main>",
    );
    await put(
      "custom/index.tsx",
      'export const meta = { ogImage: "./banner.tsx" }\nexport default () => <main>Custom</main>',
    );
    await put(
      "custom/banner.tsx",
      'export const size = { width: 800, height: 400 }\nexport default () => <div style={{ display: "flex" }}>banner</div>',
    );
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "custom", "og.png"))));
    const missing = await readFile(path.join(root, "dist", "plain", "og.png")).catch(() => null);
    expect(missing).toBeNull();
    const plain = await readFile(path.join(root, "dist", "plain", "index.html"), "utf8");
    expect(plain).not.toContain("og:image");
    const custom = await readFile(path.join(root, "dist", "custom", "index.html"), "utf8");
    expect(custom).toContain('content="/custom/og.png"');
  }));

test("an explicit meta.image is preserved and variants emit og-<name>.png", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put(
      "_og-image.tsx",
      `export default ({ title }) => <div style={{ display: "flex" }}>{title}</div>
export const variants = { square: { size: { width: 600, height: 600 }, render: () => <div style={{ display: "flex" }}>square</div> } }`,
    );
    await put(
      "index.tsx",
      'export const meta = { title: "Home", image: "/own.png" }\nexport default () => <main>Home</main>',
    );
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og-square.png"))));
    const html = await readFile(path.join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('content="/own.png"');
  }));

test("components, async components and fragments render inside cards", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put(
      "_og-image.tsx",
      `async function Remote({ label }) { return <span>{label}</span> }
const Local = ({ children }) => <div style={{ display: "flex" }}>{children}</div>
export default () => (
  <>
    <Local><Remote label="async" /></Local>
    plain text
  </>
)`,
    );
    await put("index.tsx", "export default () => <main>Home</main>");
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
  }));

test("a missing default export fails with OG_IMAGE_FAILED and a fix hint", () =>
  fixture(async (root, put) => {
    await put("_og-image.tsx", "export const size = { width: 100, height: 100 }");
    await put("index.tsx", "export default () => <main>Home</main>");
    const error = await build({ root, assets: false }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SsgError);
    expect((error as SsgError).reason).toBe("OG_IMAGE_FAILED");
    expect(String(error)).toContain("default component");
  }));

test("raw HTML inside a card is refused with a fix hint", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put(
      "_og-image.tsx",
      'export default () => <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />',
    );
    await put("index.tsx", "export default () => <main>Home</main>");
    const error = await build({ root, assets: false }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SsgError);
    expect((error as SsgError).reason).toBe("OG_IMAGE_FAILED");
  }));

test("declared fonts load relative to the _og-image file", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    const font = await readFile(
      path.join(import.meta.dirname, "../fonts/inter-latin-400-normal.woff2"),
    );
    await mkdir(path.join(root, "src", "assets"), { recursive: true });
    await writeFile(path.join(root, "src", "assets", "brand.woff2"), font);
    await put(
      "_og-image.tsx",
      `export const fonts = [{ name: "Brand", path: "./assets/brand.woff2" }]
export default () => <div style={{ display: "flex", fontFamily: "Brand" }}>branded</div>`,
    );
    await put("index.tsx", "export default () => <main>Home</main>");
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
  }));

test("the second build reuses the card cache and still emits identical cards", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", CARD);
    await put("index.tsx", "export default () => <main>Home</main>");
    await build({ root, assets: false });
    const first = new Uint8Array(await readFile(path.join(root, "dist", "og.png")));
    await build({ root, assets: false });
    const second = new Uint8Array(await readFile(path.join(root, "dist", "og.png")));
    expectPng(second);
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    const cached = await readdir(path.join(root, "node_modules", ".cache", "vincle-og-images"));
    expect(cached.filter((name) => name.endsWith(".png")).length).toBeGreaterThan(0);
  }));
