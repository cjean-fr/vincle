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

test("an explicit meta.image stays the author's and no card is generated", () =>
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
    expect(await readFile(path.join(root, "dist", "og.png")).catch(() => null)).toBeNull();
    expect(await readFile(path.join(root, "dist", "og-square.png")).catch(() => null)).toBeNull();
    const html = await readFile(path.join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('content="/own.png"');
  }));

test("variants emit og-<name>.png", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put(
      "_og-image.tsx",
      `export default ({ title }) => <div style={{ display: "flex" }}>{title}</div>
export const variants = { square: { size: { width: 600, height: 600 }, render: () => <div style={{ display: "flex" }}>square</div> } }`,
    );
    await put(
      "index.tsx",
      'export const meta = { title: "Home" }\nexport default () => <main>Home</main>',
    );
    await build({ root, assets: false });
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og.png"))));
    expectPng(new Uint8Array(await readFile(path.join(root, "dist", "og-square.png"))));
  }));

test("meta.image is an absolute, encoded URL when site and base are set", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", CARD);
    await put(
      "guide/\u00e9t\u00e9.tsx",
      'export const meta = { title: "\u00c9t\u00e9" }\nexport default () => <main>\u00c9t\u00e9</main>',
    );
    await build({ root, assets: false, site: "https://example.com", base: "/docs/" });
    const html = await readFile(
      path.join(root, "dist", "guide", "\u00e9t\u00e9", "index.html"),
      "utf8",
    );
    expect(html).toContain('content="https://example.com/docs/guide/%C3%A9t%C3%A9/og.png"');
    expectPng(
      new Uint8Array(await readFile(path.join(root, "dist", "guide", "\u00e9t\u00e9", "og.png"))),
    );
  }));

test("a page emitting its own og.png wins over the generated card", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", CARD);
    await put("index.tsx", "export default () => <main>Home</main>");
    await put("og.png.ts", "export default () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])");
    await build({ root, assets: false });
    const png = new Uint8Array(await readFile(path.join(root, "dist", "og.png")));
    expect(png.length).toBe(5); // the page's own file, not the generated card
    const html = await readFile(path.join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('content="/og.png"');
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

test("the caches short-circuit the engine and the encoder on unchanged markup", () =>
  fixture(async (root, put) => {
    await put("_layout.tsx", LAYOUT);
    await put("_og-image.tsx", CARD);
    await put("index.tsx", "export default () => <main>Home</main>");
    await build({ root, assets: false });
    const cacheDirectory = path.join(root, "node_modules", ".cache", "vincle-og-images");
    const first = await readdir(cacheDirectory);
    const pngEntry = first.find((name) => name.endsWith(".png"))!;
    const svgEntry = first.find((name) => name.endsWith(".svg"))!;
    expect(pngEntry).toBeDefined();
    expect(svgEntry).toBeDefined();
    const firstPng = new Uint8Array(await readFile(path.join(root, "dist", "og.png")));

    // A valid-signature fake PNG in the cache is served as-is: the encoder did not run.
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await writeFile(path.join(cacheDirectory, pngEntry), fakePng);
    await build({ root, assets: false });
    expect(
      Buffer.from(new Uint8Array(await readFile(path.join(root, "dist", "og.png")))).equals(
        Buffer.from(fakePng),
      ),
    ).toBe(true);

    // A blank document in the layout cache yields a blank card: the engine did not run.
    await writeFile(
      path.join(cacheDirectory, svgEntry),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"/>',
    );
    await build({ root, assets: false });
    const blankPng = new Uint8Array(await readFile(path.join(root, "dist", "og.png")));
    expect(Buffer.from(blankPng).equals(Buffer.from(firstPng))).toBe(false);
    expectPng(blankPng);

    // A markup change re-renders under new keys; old entries are kept.
    await put(
      "_og-image.tsx",
      'export default () => <div style={{ display: "flex" }}>changed</div>',
    );
    await build({ root, assets: false });
    expect((await readdir(cacheDirectory)).length).toBeGreaterThan(first.length);
  }));
