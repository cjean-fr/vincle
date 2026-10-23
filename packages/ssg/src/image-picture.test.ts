import { renderToString, Scope } from "@vincle/core";
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ImageConverter, ImageDescriptor, PictureProps } from "./image.js";

import {
  ERR_VINCLE_IMAGE_INVALID,
  ERR_VINCLE_IMAGE_UNDECLARED,
  images,
  Picture,
  setImages,
} from "./image.js";
import { build } from "./index.js";

const portrait: ImageDescriptor = {
  id: "portrait",
  source: "assets/master.bin",
  directory: "portraits",
  name: "photo",
  widths: [80, 160, 256, 352, 512, 768],
  formats: ["avif", "webp", "jpg"],
};

const sizes = "(min-width: 1024px) 256px, (min-width: 768px) 224px, 80px";

/** Render `<Picture>` inside a scope, where `install` may set the registry. */
async function renderInScope(props: PictureProps, install?: () => void): Promise<string> {
  return Scope.with(() => {
    install?.();
    return renderToString(Picture(props));
  });
}

/** The common case: one portrait declared, then one `<Picture>` rendered. */
function renderPortrait(props: PictureProps, base?: string): Promise<string> {
  return renderInScope(props, () => setImages([portrait], { base }));
}

async function capture(run: () => unknown | Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw error;
    return error;
  }
  throw new Error("Expected <Picture> to throw");
}

/** The `code` carried by a Vincle error, if any. */
function code(error: Error): string | undefined {
  return (error as Error & { code?: string }).code;
}

/** Deterministic stand-in for a real codec: encodes text bytes, decodes a fixed size. */
function fakeConverter(formats: readonly string[] = ["avif", "webp", "jpg"]): ImageConverter {
  return {
    formats,
    async decode() {
      return { width: 1024, height: 1024 };
    },
    async encode(_image, variant) {
      return new TextEncoder().encode(`fake:${variant.format}:${variant.width}`);
    },
  };
}

test("renders the portrait markup from the declared descriptor", async () => {
  const html = await renderPortrait({
    image: portrait,
    alt: "",
    sizes,
    fallbackWidth: 256,
    width: 1024,
    height: 1024,
    decoding: "async",
    fetchPriority: "high",
    pictureClass: "contents",
    class: "site-portrait",
  });
  // The runtime inserts no separator between elements: the whole string is the contract.
  const expected = [
    '<picture class="contents">',
    '<source srcset="/portraits/photo-80.avif 80w, /portraits/photo-160.avif 160w, /portraits/photo-256.avif 256w, /portraits/photo-352.avif 352w, /portraits/photo-512.avif 512w, /portraits/photo-768.avif 768w"',
    ` sizes="${sizes}" type="image/avif">`,
    '<source srcset="/portraits/photo-80.webp 80w, /portraits/photo-160.webp 160w, /portraits/photo-256.webp 256w, /portraits/photo-352.webp 352w, /portraits/photo-512.webp 512w, /portraits/photo-768.webp 768w"',
    ` sizes="${sizes}" type="image/webp">`,
    '<img src="/portraits/photo-256.jpg" srcset="/portraits/photo-80.jpg 80w, /portraits/photo-160.jpg 160w, /portraits/photo-256.jpg 256w, /portraits/photo-352.jpg 352w, /portraits/photo-512.jpg 512w, /portraits/photo-768.jpg 768w"',
    ` sizes="${sizes}" alt="" width="1024" height="1024" class="site-portrait" fetchpriority="high" decoding="async">`,
    "</picture>",
  ].join("");
  expect(html).toBe(expected);
});

test("prefixes the public base in every URL", async () => {
  const html = await renderPortrait({ image: portrait, alt: "", sizes }, "/docs/");
  const attributes = [...html.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((match) => match[1]!);
  // One src, one srcset per format.
  expect(attributes.length).toBe(4);
  for (const attribute of attributes)
    for (const candidate of attribute.split(", "))
      expect(candidate.split(" ")[0]!.startsWith("/docs/portraits/photo-")).toBe(true);
  expect(html).not.toContain("//portraits");
});

test("omits the type attribute for an unknown format", async () => {
  const descriptor: ImageDescriptor = { ...portrait, formats: ["avif", "tiff"] };
  const html = await renderInScope({ image: descriptor, alt: "" }, () => setImages([descriptor]));
  expect(html).toContain('type="image/avif"');
  // Only the avif <source> carries a type: tiff is the <img> fallback and unknown.
  expect(html.match(/type="/g)?.length).toBe(1);
  expect(html).toContain('src="/portraits/photo-768.tiff"');
});

test("uses the descriptor mime override", async () => {
  const descriptor: ImageDescriptor = {
    ...portrait,
    formats: ["tiff", "avif"],
    mime: { tiff: "image/tiff" },
  };
  const html = await renderInScope({ image: descriptor, alt: "" }, () => setImages([descriptor]));
  expect(html).toContain('type="image/tiff"');
  expect(html).not.toContain('type="image/avif"');
  expect(html).toContain('src="/portraits/photo-768.avif"');
});

test("defaults fallbackWidth to the largest width", async () => {
  const html = await renderPortrait({ image: portrait, alt: "" });
  expect(html).toContain('src="/portraits/photo-768.jpg"');
});

test("rejects a fallbackWidth outside the descriptor widths", async () => {
  const error = await capture(() =>
    renderPortrait({ image: portrait, alt: "", fallbackWidth: 300 }),
  );
  expect(code(error)).toBe(ERR_VINCLE_IMAGE_INVALID);
  expect(error.message).toContain("has no width 300");
  expect(error.message).toContain("declared widths: 80, 160");
});

test("rejects an undeclared descriptor and lists the declared ids", async () => {
  const error = await capture(() =>
    renderPortrait({ image: { ...portrait, id: "thumb" }, alt: "" }),
  );
  expect(code(error)).toBe(ERR_VINCLE_IMAGE_UNDECLARED);
  expect(error.message).toContain('"thumb"');
  expect(error.message).toContain("Declared images: portrait");
});

test("rejects rendering without a registry", async () => {
  const error = await capture(() => renderInScope({ image: portrait, alt: "" }));
  expect(code(error)).toBe(ERR_VINCLE_IMAGE_UNDECLARED);
  expect(error.message).toContain("without an image registry");
});

test("escapes alt and class values", async () => {
  const html = await renderPortrait({
    image: portrait,
    alt: 'He said "hi" & <bye>',
    class: 'a"b',
  });
  expect(html).toContain("&quot;");
  expect(html).toContain("&amp;");
  expect(html).toContain("&lt;");
  expect(html).not.toContain("<bye>");
});

test("renders inside a build with the images() integration", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-image-picture-test-"));
  const put = async (name: string, content: string) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  try {
    await put("assets/master.bin", "master");
    // The page carries a copy of the descriptor; the registry declared in the build wins.
    await put("src/_images.ts", `export const portrait = ${JSON.stringify(portrait)};`);
    await put(
      "src/index.tsx",
      'import {Picture} from "@vincle/ssg/image"; import {portrait} from "./_images.ts";' +
        ' export default () => <Picture image={portrait} alt="" fallbackWidth={256} />;',
    );
    await build({ root, assets: images({ converter: fakeConverter(), descriptors: [portrait] }) });
    const html = await readFile(path.join(root, "dist/index.html"), "utf8");
    expect(html).toContain('srcset="/portraits/photo-80.avif 80w');
    expect(html).toContain('src="/portraits/photo-256.jpg"');
    for (const file of [
      "portraits/photo-80.avif",
      "portraits/photo-160.webp",
      "portraits/photo-256.jpg",
    ])
      expect(existsSync(path.join(root, "dist", file))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setImages(null) clears the registry", async () => {
  const error = await capture(() =>
    renderInScope({ image: portrait, alt: "" }, () => {
      setImages([portrait]);
      setImages(null);
    }),
  );
  expect(code(error)).toBe(ERR_VINCLE_IMAGE_UNDECLARED);
  expect(error.message).toContain("Declared images: (none)");
});

test("uses the registry descriptor rather than the prop copy", async () => {
  const html = await renderPortrait({
    image: { ...portrait, widths: [1], formats: ["jpg"] },
    alt: "",
  });
  expect(html).toContain("80w");
  expect(html).toContain("768w");
  expect(html).toContain("avif");
  expect(html).not.toContain("1w");
});

test("renders without optional attributes when they are absent", async () => {
  const html = await renderPortrait({ image: portrait, alt: "" });
  expect(html).not.toContain("sizes=");
  expect(html).not.toContain("width=");
  expect(html).not.toContain("height=");
  expect(html).not.toContain('class="');
  expect(html).not.toContain("fetchpriority");
  expect(html).not.toContain("decoding");
  expect(html).not.toContain("loading");
  expect(html).toContain('src="/portraits/photo-768.jpg"');
});
