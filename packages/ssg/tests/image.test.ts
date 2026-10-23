import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ImageConverter, ImageDescriptor, ImageOptions } from "../src/image.js";
import type { PageHandler } from "../src/index.js";

import { imageUrl, images } from "../src/image.js";
import { build, SsgError } from "../src/index.js";

async function fixture(
  run: (root: string, put: (name: string, content: string) => Promise<void>) => Promise<void>,
) {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-image-test-"));
  const put = async (name: string, content: string) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  try {
    await run(root, put);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function capture(run: () => unknown | Promise<unknown>): Promise<SsgError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(SsgError);
    if (!(error instanceof SsgError)) throw error;
    return error;
  }
  throw new Error("Expected an SsgError");
}

/** Deterministic stand-in for a real image codec: records calls, encodes text bytes. */
function fakeConverter(formats: readonly string[] = ["avif", "webp", "jpg"]) {
  const decoded: string[] = [];
  const encoded: string[] = [];
  const converter: ImageConverter = {
    formats,
    async decode(source) {
      decoded.push(source);
      return { width: 1024, height: 1024 };
    },
    async encode(_image, variant) {
      encoded.push(`${variant.format}:${variant.width}`);
      return new TextEncoder().encode(`fake:${variant.format}:${variant.width}`);
    },
  };
  return { converter, decoded, encoded };
}

const descriptor = (overrides: Partial<ImageDescriptor> = {}): ImageDescriptor => ({
  id: "portrait",
  source: "assets/master.bin",
  directory: "portraits",
  name: "photo",
  widths: [80, 256],
  formats: ["avif", "webp", "jpg"],
  ...overrides,
});

/** Validation runs synchronously in images(); no build is involved. */
function invalidOptions(options: ImageOptions): SsgError {
  try {
    images(options);
  } catch (error) {
    expect(error).toBeInstanceOf(SsgError);
    if (!(error instanceof SsgError)) throw error;
    return error;
  }
  throw new Error("Expected images() to reject its configuration");
}

test("generates every variant with one decode and deterministic URLs", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const { converter, decoded, encoded } = fakeConverter();
    const descriptors = [descriptor()];
    const result = await build({ root, assets: images({ converter, descriptors }) });
    expect(decoded).toEqual([path.join(root, "assets/master.bin")]);
    expect(encoded).toEqual(["avif:80", "webp:80", "jpg:80", "avif:256", "webp:256", "jpg:256"]);
    expect(result.files.toSorted()).toEqual([
      "index.html",
      "portraits/photo-256.avif",
      "portraits/photo-256.jpg",
      "portraits/photo-256.webp",
      "portraits/photo-80.avif",
      "portraits/photo-80.jpg",
      "portraits/photo-80.webp",
    ]);
    expect(await readFile(path.join(root, "dist/portraits/photo-256.webp"), "utf8")).toBe(
      "fake:webp:256",
    );
    expect(imageUrl(descriptors[0]!, 256, "webp")).toBe("/portraits/photo-256.webp");
  }));

test("reuses memoized variants on a second preparation", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const { converter, decoded, encoded } = fakeConverter();
    const assets = images({ converter, descriptors: [descriptor()] });
    const first = await build({ root, assets });
    const second = await build({ root, assets });
    expect(decoded.length).toBe(1);
    expect(encoded.length).toBe(6);
    expect(second.files).toEqual(first.files);
    expect(await readFile(path.join(root, "dist/portraits/photo-80.avif"), "utf8")).toBe(
      "fake:avif:80",
    );
  }));

test("regenerates variants when the source stat changes", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const master = path.join(root, "assets/master.bin");
    const { converter, decoded, encoded } = fakeConverter();
    const assets = images({ converter, descriptors: [descriptor()] });
    await build({ root, assets });
    expect(decoded.length).toBe(1);
    expect(encoded.length).toBe(6);

    // A new modification time invalidates the decoded image and every variant.
    const later = new Date(Date.now() + 5_000);
    await utimes(master, later, later);
    await build({ root, assets });
    expect(decoded.length).toBe(2);
    expect(encoded.length).toBe(12);

    // A new size alone is enough, even with the modification time held constant.
    const before = await stat(master);
    await writeFile(master, "master with a longer body");
    await utimes(master, before.atime, before.mtime);
    const forced = await stat(master);
    expect(forced.size).not.toBe(before.size);
    expect(forced.mtimeMs).toBe(before.mtimeMs);
    await build({ root, assets });
    expect(decoded.length).toBe(3);
    expect(encoded.length).toBe(18);
  }));

test("keeps a separate memo per images() instance", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const { converter, decoded, encoded } = fakeConverter();
    const descriptors = [descriptor()];
    await build({ root, assets: images({ converter, descriptors }) });
    await build({ root, assets: images({ converter, descriptors }) });
    // Each configuration decodes once and encodes its six variants once.
    expect(decoded.length).toBe(2);
    expect(encoded.length).toBe(12);
  }));

test("reports a missing image source before publishing", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    const { converter } = fakeConverter();
    const missing = await capture(() =>
      build({
        root,
        assets: images({ converter, descriptors: [descriptor({ source: "assets/missing.bin" })] }),
      }),
    );
    expect(missing.reason).toBe("ASSETS_FAILED");
    expect(missing.context["image"]).toBe("portrait");
    expect(missing.context["source"]).toBe("assets/missing.bin");
    expect(missing.message).toContain("Image source not found: assets/missing.bin");
    expect(missing.message).toContain("Could not prepare asset integration #1");
    expect(existsSync(path.join(root, "dist"))).toBe(false);

    await put("assets/folder/keep.bin", "keep");
    const directory = await capture(() =>
      build({
        root,
        assets: images({ converter, descriptors: [descriptor({ source: "assets/folder" })] }),
      }),
    );
    expect(directory.reason).toBe("ASSETS_FAILED");
    expect(directory.context["source"]).toBe("assets/folder");
    expect(directory.message).toContain("Image source is not a file: assets/folder");
    expect(existsSync(path.join(root, "dist"))).toBe(false);
  }));

test("reports converter failures with the integration context", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const single = [descriptor({ widths: [80], formats: ["avif", "webp"] })];

    const throwingDecode: ImageConverter = {
      formats: ["avif", "webp"],
      async decode() {
        throw new Error("decode boom");
      },
      async encode() {
        return new Uint8Array([1]);
      },
    };
    const decodeError = await capture(() =>
      build({ root, assets: images({ converter: throwingDecode, descriptors: single }) }),
    );
    expect(decodeError.reason).toBe("ASSETS_FAILED");
    expect(decodeError.message).toContain("Could not decode image portrait");
    expect(decodeError.context["image"]).toBe("portrait");
    expect(decodeError.context["phase"]).toBe("assets");
    expect(decodeError.context["root"]).toBe(root);

    const { converter } = fakeConverter();
    const throwingEncode: ImageConverter = {
      ...converter,
      async encode(_image, variant) {
        if (variant.format === "webp" && variant.width === 80) throw new Error("encode boom");
        return new TextEncoder().encode("bytes");
      },
    };
    const encodeError = await capture(() =>
      build({ root, assets: images({ converter: throwingEncode, descriptors: single }) }),
    );
    expect(encodeError.reason).toBe("ASSETS_FAILED");
    expect(encodeError.message).toContain("Could not encode image portrait at 80.webp");
    expect(encodeError.context["variant"]).toBe("80.webp");
    expect(encodeError.context["image"]).toBe("portrait");

    const noBytes: ImageConverter = {
      ...converter,
      async encode(_image, variant) {
        if (variant.format === "webp") return undefined as unknown as Uint8Array;
        return new TextEncoder().encode("bytes");
      },
    };
    const bytesError = await capture(() =>
      build({ root, assets: images({ converter: noBytes, descriptors: single }) }),
    );
    expect(bytesError.reason).toBe("ASSETS_FAILED");
    expect(bytesError.message).toContain(
      "Converter returned no bytes for image portrait at 80.webp",
    );
    expect(bytesError.context["variant"]).toBe("80.webp");
    expect(bytesError.context["phase"]).toBe("assets");
    expect(bytesError.context["root"]).toBe(root);
  }));

test("validates descriptors and converter formats when images() is called", () => {
  const { converter } = fakeConverter();
  const cases: {
    options: ImageOptions;
    field: string;
    image: string;
    summary: string;
    value?: string | number;
  }[] = [
    {
      options: {
        converter: {
          formats: ["avif"],
          async decode() {
            return { width: 1, height: 1 };
          },
        } as unknown as ImageConverter,
        descriptors: [],
      },
      field: "converter",
      image: "#1",
      summary: "images(): options.converter must provide decode() and encode() functions.",
    },
    {
      options: { converter: fakeConverter([]).converter, descriptors: [] },
      field: "converter.formats",
      image: "#1",
      summary:
        'images(): converter.formats must be a non-empty array of extension strings such as "avif".',
    },
    {
      options: { converter: fakeConverter(["AVIF!"]).converter, descriptors: [] },
      field: "converter.formats",
      image: "#1",
      summary:
        'images(): converter.formats must be a non-empty array of extension strings such as "avif".',
    },
    {
      options: { converter: fakeConverter(["avif", "avif"]).converter, descriptors: [] },
      field: "converter.formats",
      image: "#1",
      summary: "images(): converter.formats is not unique.",
    },
    {
      options: { converter, descriptors: [descriptor({ id: "   " })] },
      field: "id",
      image: "#1",
      summary: "images(): image #1 has no id.",
    },
    {
      options: {
        converter,
        descriptors: [descriptor(), descriptor({ id: "portrait" })],
      },
      field: "id",
      image: "portrait",
      summary: 'images(): duplicate image id "portrait".',
    },
    {
      options: { converter, descriptors: [descriptor({ widths: [80, 0] })] },
      field: "widths",
      image: "portrait",
      summary: "images(): image portrait width 0 is not a positive integer.",
      value: 0,
    },
    {
      options: { converter, descriptors: [descriptor({ widths: [] })] },
      field: "widths",
      image: "portrait",
      summary: "images(): image portrait declares no widths.",
    },
    {
      options: { converter, descriptors: [descriptor({ widths: [80.5] })] },
      field: "widths",
      image: "portrait",
      summary: "images(): image portrait width 80.5 is not a positive integer.",
      value: 80.5,
    },
    {
      options: { converter, descriptors: [descriptor({ widths: [80, 80] })] },
      field: "widths",
      image: "portrait",
      summary: "images(): image portrait declares duplicate widths.",
    },
    {
      options: { converter, descriptors: [descriptor({ formats: ["gif"] })] },
      field: "formats",
      image: "portrait",
      summary: 'images(): image portrait format "gif" is not supported by the converter.',
      value: "gif",
    },
    {
      options: { converter, descriptors: [descriptor({ formats: ["avif", "avif"] })] },
      field: "formats",
      image: "portrait",
      summary: "images(): image portrait declares duplicate formats.",
    },
    {
      options: {
        converter,
        descriptors: [descriptor({ mime: "image/tiff" as unknown as Record<string, string> })],
      },
      field: "mime",
      image: "portrait",
      summary: "images(): image portrait has an invalid mime table.",
    },
    {
      options: {
        converter,
        descriptors: [descriptor({ formats: ["avif"], mime: { tiff: "image/tiff" } })],
      },
      field: "mime",
      image: "portrait",
      summary: 'images(): image portrait declares mime for undeclared format "tiff".',
      value: "tiff",
    },
    {
      options: { converter, descriptors: [descriptor({ mime: { avif: "  " } })] },
      field: "mime",
      image: "portrait",
      summary: 'images(): image portrait has an invalid mime type for "avif".',
      value: "  ",
    },
    {
      options: { converter, descriptors: [descriptor({ directory: "../portraits" })] },
      field: "directory",
      image: "portrait",
      summary: 'images(): image portrait has an invalid directory "../portraits".',
      value: "../portraits",
    },
    {
      options: { converter, descriptors: [descriptor({ directory: "portraits//photo" })] },
      field: "directory",
      image: "portrait",
      summary: 'images(): image portrait has an invalid directory "portraits//photo".',
      value: "portraits//photo",
    },
    {
      options: { converter, descriptors: [descriptor({ name: "photo/256" })] },
      field: "name",
      image: "portrait",
      summary: 'images(): image portrait has an invalid name "photo/256".',
      value: "photo/256",
    },
    {
      options: { converter, descriptors: [descriptor({ source: "" })] },
      field: "source",
      image: "portrait",
      summary: "images(): image portrait has no source.",
    },
    {
      options: {
        converter,
        descriptors: [null as unknown as ImageDescriptor],
      },
      field: "descriptor",
      image: "#1",
      summary: "images(): descriptor #1 must be an object.",
    },
  ];
  for (const entry of cases) {
    const error = invalidOptions(entry.options);
    expect(error.reason).toBe("INVALID_CONFIG");
    expect(error.context["phase"]).toBe("images");
    expect(error.context["image"]).toBe(entry.image);
    expect(error.context["field"]).toBe(entry.field);
    expect(error.message).toContain(entry.summary);
    if (entry.value !== undefined) expect(error.context["value"]).toBe(entry.value);
  }
});

test("rejects two descriptors writing the same files", () => {
  const { converter } = fakeConverter(["avif", "webp", "jpg", "retina-256.avif"]);
  const samePrefix = invalidOptions({
    converter,
    descriptors: [descriptor({ id: "portrait" }), descriptor({ id: "thumb" })],
  });
  expect(samePrefix.reason).toBe("INVALID_CONFIG");
  expect(samePrefix.message).toContain('write the same directory/name "portraits/photo"');
  expect(samePrefix.context["field"]).toBe("directory/name");

  // Distinct directory/name prefixes whose variant paths meet through the format suffix.
  const sameFile = invalidOptions({
    converter,
    descriptors: [
      descriptor({ id: "full", name: "photo", widths: [80], formats: ["retina-256.avif"] }),
      descriptor({ id: "sized", name: "photo-80.retina", widths: [256], formats: ["avif"] }),
    ],
  });
  expect(sameFile.reason).toBe("INVALID_CONFIG");
  expect(sameFile.message).toContain('write the same file "portraits/photo-80.retina-256.avif"');
  expect(sameFile.context["field"]).toBe("files");
});

test("imageUrl returns the public path of a variant", () => {
  expect(imageUrl({ directory: "portraits", name: "photo" }, 256, "avif")).toBe(
    "/portraits/photo-256.avif",
  );
  expect(imageUrl({ directory: "img/portraits", name: "photo" }, 80, "webp")).toBe(
    "/img/portraits/photo-80.webp",
  );
  const url = imageUrl({ directory: "portraits", name: "photo" }, 80, "avif");
  expect(url).not.toContain("?");
  expect(url).not.toContain("#");
  expect(url.startsWith("/docs/")).toBe(false);
});

test("publishes variants at their public URLs during a build", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const { converter } = fakeConverter();
    const descriptors = [
      descriptor({
        directory: "img/portraits",
        name: "photo",
        widths: [80],
        formats: ["avif", "webp"],
      }),
    ];
    const result = await build({ root, assets: images({ converter, descriptors }) });
    for (const [width, format] of [
      [80, "avif"],
      [80, "webp"],
    ] as const) {
      const url = imageUrl(descriptors[0]!, width, format);
      expect(result.files).toContain(url.slice(1));
      expect(await readFile(path.join(root, "dist", url.slice(1)), "utf8")).toBe(
        `fake:${format}:${width}`,
      );
    }
  }));

test("reports a collision with a page output at the same path", () =>
  fixture(async (root, put) => {
    await put("src/page.fixture", "fixture");
    await put("assets/master.bin", "master");
    const { converter } = fakeConverter();
    const handlers: Readonly<Record<string, PageHandler>> = {
      ".fixture": {
        name: "fixture",
        load: () => ({
          render: () => ({ path: "portraits/photo-80.avif", content: "page" }),
        }),
      },
    };
    const error = await capture(() =>
      build({
        root,
        handlers,
        assets: images({
          converter,
          descriptors: [descriptor({ widths: [80], formats: ["avif"] })],
        }),
      }),
    );
    expect(error.reason).toBe("OUTPUT_COLLISION");
    expect(error.message).toContain("portraits/photo-80.avif");
  }));

test("ignores base when generating image files", () =>
  fixture(async (root, put) => {
    await put("src/index.tsx", "export default () => <p>page</p>");
    await put("assets/master.bin", "master");
    const { converter, decoded } = fakeConverter();
    const descriptors = [descriptor({ widths: [80], formats: ["avif"] })];
    const result = await build({
      root,
      base: "/docs/",
      assets: images({ converter, descriptors }),
    });
    expect(decoded.length).toBe(1);
    expect(result.files).toContain("portraits/photo-80.avif");
    expect(await readFile(path.join(root, "dist/portraits/photo-80.avif"), "utf8")).toBe(
      "fake:avif:80",
    );
    expect(imageUrl(descriptors[0]!, 80, "avif")).toBe("/portraits/photo-80.avif");
  }));

test("reports the faulty mime value in the error context", () => {
  const { converter } = fakeConverter();
  const blank = invalidOptions({
    converter,
    descriptors: [descriptor({ mime: { avif: "  " } })],
  });
  expect(blank.context["field"]).toBe("mime");
  expect(blank.context["value"]).toBe("  ");
  expect(blank.message).toContain('images(): image portrait has an invalid mime type for "avif".');

  const numeric = invalidOptions({
    converter,
    descriptors: [descriptor({ mime: { avif: 3 as unknown as string } })],
  });
  expect(numeric.context["field"]).toBe("mime");
  expect(numeric.context["value"]).toBe(3);
  expect(numeric.message).toContain(
    'images(): image portrait has an invalid mime type for "avif".',
  );
});
