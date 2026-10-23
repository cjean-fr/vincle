import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  build,
  discoverPages,
  generateSite,
  outputPathForRoute,
  SsgError,
  ERR_SSG_BUILD,
} from "../src/index.js";

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-errors-"));
  try {
    await run(root);
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

test("encoded traversal URLs fail before replacing the published site", () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/page.fixture"), "fixture");
    await generateSite({
      out: path.join(root, "dist"),
      outputs: [{ path: "index.html", content: "old" }],
    });
    for (const segment of ["%2e", "%2E%2e", ".%2e", "%2E."]) {
      const error = await capture(() =>
        build({
          root,
          assets: false,
          site: "https://example.test/docs/",
          handlers: {
            ".fixture": {
              name: "fixture",
              load: () => ({
                render: () => ({ path: "page.html", url: `/${segment}/outside`, content: "new" }),
              }),
            },
          },
        }),
      );
      expect(error.reason).toBe("INVALID_ROUTE");
      expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe("old");
    }
  }));

test("failing asset disposal cleans temporary files and preserves the original build error", () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/page.fixture"), "fixture");
    let failRender = false;
    const run = () =>
      build({
        root,
        handlers: {
          ".fixture": {
            name: "fixture",
            load: () => ({
              render() {
                if (failRender) throw new Error("original render failure");
                return { path: "index.html", content: "published" };
              },
            }),
          },
        },
        assets: {
          async prepare({ out }) {
            await mkdir(out);
            return {
              directory: out,
              dispose() {
                throw new Error("dispose failure");
              },
            };
          },
        },
      });
    const cleanup = await capture(run);
    expect(cleanup.reason).toBe("ASSETS_FAILED");
    expect(cleanup.context["phase"]).toBe("cleanup");
    expect(cleanup.hint).toContain("published successfully");
    expect(cleanup.message).toContain("dispose failure");
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe("published");
    expect((await readdir(root)).filter((name) => name.startsWith(".vincle-"))).toEqual([]);
    failRender = true;
    const original = await capture(run);
    expect(original.reason).toBe("SOURCE_FAILED");
    expect(original.message).toContain("original render failure");
    expect(original.message).not.toContain("dispose failure");
    expect((await readdir(root)).filter((name) => name.startsWith(".vincle-"))).toEqual([]);
  }));

test("missing default/custom src aborts before assets, plugins or output publication", () =>
  fixture(async (root) => {
    const out = path.join(root, "dist");
    await generateSite({
      out,
      outputs: [
        { path: "index.html", content: "previous site" },
        { path: "assets/client.js", content: "previous assets" },
      ],
    });
    let assetCalls = 0;
    let pluginCalls = 0;
    for (const src of ["src", "routes"]) {
      const error = await capture(() =>
        build({
          root,
          ...(src === "src" ? {} : { src }),
          assets: {
            prepare: async () => {
              assetCalls++;
              throw new Error("should not run");
            },
          },
          plugins: [
            {
              name: "spy",
              metadata() {
                pluginCalls++;
              },
            },
          ],
        }),
      );
      expect(error.code).toBe(ERR_SSG_BUILD);
      expect(error.reason).toBe("SOURCE_MISSING");
      expect(error.message).toContain("Source directory does not exist");
      expect(error.message).toContain(path.join(root, src));
      expect(error.message).toContain("Fix:");
      expect(error.hint).toContain("build({ src })");
      expect(error.hint).toContain("previous output was left untouched");
      const json = JSON.parse(JSON.stringify(error));
      expect(json).toMatchObject({
        code: ERR_SSG_BUILD,
        reason: "SOURCE_MISSING",
        context: { root, src: path.join(root, src), out, phase: "discovery" },
      });
      expect(json.cause.cause.code).toBe("ENOENT");
    }
    expect(assetCalls).toBe(0);
    expect(pluginCalls).toBe(0);
    expect(await readFile(path.join(out, "index.html"), "utf8")).toBe("previous site");
    expect(await readFile(path.join(out, "assets/client.js"), "utf8")).toBe("previous assets");
  }));

test("a file used as src fails explicitly, while an existing empty source directory is valid", () =>
  fixture(async (root) => {
    await writeFile(path.join(root, "src"), "not a directory");
    const error = await capture(() => build({ root }));
    expect(error.reason).toBe("SOURCE_NOT_DIRECTORY");
    expect(error.hint).toContain("not to a file");
    expect(await Bun.file(path.join(root, "dist")).exists()).toBe(false);
    await rm(path.join(root, "src"));
    await mkdir(path.join(root, "src"));
    expect(await build({ root })).toEqual({ files: [] });
  }));

test("writer errors retain the original reason, actionable fix and output context", () =>
  fixture(async (root) => {
    const out = path.join(root, "dist");
    const collision = await capture(() =>
      generateSite({
        out,
        outputs: [
          { path: "same", content: "one" },
          { path: "same", content: "two" },
        ],
      }),
    );
    expect(collision.reason).toBe("OUTPUT_COLLISION");
    expect(collision.context).toMatchObject({ out, path: "same", phase: "prepare" });
    expect(collision.hint).toContain("unique destination");
    const copied = await capture(() =>
      generateSite({ out, outputs: [], copy: [{ from: path.join(root, "missing") }] }),
    );
    expect(copied.reason).toBe("COPY_FAILED");
    const json = JSON.parse(JSON.stringify(copied));
    expect(json.message).toContain("Fix:");
    expect(JSON.stringify(json.cause)).toContain("ENOENT");
    const route = await capture(() => outputPathForRoute("/../escape"));
    expect(route.reason).toBe("INVALID_ROUTE");
    expect(route.context).toMatchObject({ route: "/../escape" });
  }));

test("discovery errors identify missing roots and failing handlers", () =>
  fixture(async (root) => {
    const missing = await capture(() =>
      discoverPages({ src: path.join(root, "missing"), handlers: {} }),
    );
    expect(missing.reason).toBe("SOURCE_MISSING");
    await writeFile(path.join(root, "article.txt"), "article");
    const cause = new Error("reader failed", { cause: new Error("inner failure") });
    const failed = await capture(() =>
      discoverPages({
        src: root,
        handlers: {
          ".txt": {
            name: "text-reader",
            load() {
              throw cause;
            },
          },
        },
      }),
    );
    expect(failed.reason).toBe("SOURCE_FAILED");
    expect(failed.context).toMatchObject({
      file: path.join(root, "article.txt"),
      handler: "text-reader",
    });
    expect(JSON.stringify(failed)).toContain("inner failure");
  }));

test("plugins and asset integrations retain their identity and original cause", () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/article.fixture"), "fixture");
    const cause = new Error("bad enrichment");
    cause.cause = cause;
    const error = await capture(() =>
      build({
        root,
        handlers: {
          ".fixture": {
            name: "fixture",
            load: () => ({ render: () => ({ path: "index.html", content: "fixture" }) }),
          },
        },
        plugins: [
          {
            name: "enrichment",
            metadata() {
              throw cause;
            },
          },
        ],
      }),
    );
    expect(error.reason).toBe("PLUGIN_FAILED");
    expect(error.context).toMatchObject({ plugin: "enrichment", hook: "metadata" });
    expect(JSON.stringify(error)).toContain("bad enrichment");
    const assets = await capture(() =>
      build({
        root,
        assets: {
          prepare() {
            throw new Error("asset compiler failed");
          },
        },
      }),
    );
    expect(assets.reason).toBe("ASSETS_FAILED");
    expect(assets.context).toMatchObject({ phase: "assets" });
    expect(assets.message).toContain("asset compiler failed");
  }));

test("invalid producer returns and compiler errors expose actionable source diagnostics", () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "src"));
    const source = path.join(root, "src/bad.ts");
    await writeFile(source, "export default () => 42;");
    const output = await capture(() => build({ root }));
    expect(output.reason).toBe("INVALID_OUTPUT");
    expect(output.context).toMatchObject({ file: source, received: "number" });
    expect(output.hint).toContain("path, content");
    await writeFile(source, "export default function broken( {");
    const compiled = await capture(() => build({ root }));
    expect(compiled.reason).toBe("COMPILATION_FAILED");
    expect(compiled.context).toMatchObject({ file: source, phase: "compile" });
    expect(JSON.stringify(compiled)).toContain("bad.ts");
  }));
