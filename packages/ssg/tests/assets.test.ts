import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AssetSession } from "../src/assets.js";
import type { AssetIntegration, PageHandler } from "../src/index.js";

import { disposeBuilds, prepareAssets } from "../src/assets.js";
import { vincleRuntime } from "../src/formats.js";
import { build, SsgError } from "../src/index.js";

async function fixture(
  run: (root: string, put: (name: string, content: string) => Promise<void>) => Promise<void>,
) {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-assets-test-"));
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

/** The only handler able to observe the render chain: it renders inside the page runtime. */
const fixtureHandler: Readonly<Record<string, PageHandler>> = {
  ".fixture": {
    name: "fixture",
    load: () => ({
      render: ({ runtime }) => ({
        path: "index.html",
        content: () => runtime.render(() => "page"),
      }),
    }),
  },
};

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

test("normalizes one integration, an integration array and false", async () => {
  await fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const result = await build({
      root,
      handlers: fixtureHandler,
      assets: {
        async prepare(context) {
          await mkdir(context.out);
          await writeFile(path.join(context.out, "one.txt"), "one");
          return { directory: context.out };
        },
      },
    });
    expect(result.files).toEqual(["index.html", "one.txt"]);
    expect(await readFile(path.join(root, "dist/one.txt"), "utf8")).toBe("one");
  });

  // An explicit empty array is a decision: no conventional detection, hence no Vite bundle.
  await fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    await put("_client/main.ts", 'console.log("client");');
    const result = await build({ root, handlers: fixtureHandler, assets: [] });
    expect(result.files).toEqual(["index.html"]);
  });

  await fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const result = await build({ root, handlers: fixtureHandler, assets: false });
    expect(result.files).toEqual(["index.html"]);
    expect(await readdir(path.join(root, "dist"))).toEqual(["index.html"]);
  });

  await fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const result = await build({ root, handlers: fixtureHandler });
    expect(result.files).toEqual(["index.html"]);
  });
});

test("builds each integration in its own directory, copies once and nests render in declaration order", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const outs: string[] = [];
    const integration = (name: string, tag: string): AssetIntegration => ({
      async prepare(context) {
        outs.push(context.out);
        expect(path.isAbsolute(context.out)).toBe(true);
        // The core owns the container; each integration owns its preparation directory.
        expect((await stat(path.dirname(context.out))).isDirectory()).toBe(true);
        await mkdir(context.out);
        await writeFile(path.join(context.out, `${name}.txt`), name);
        return {
          directory: context.out,
          render: async (runtime, create) => `<${tag}>${await runtime.render(create)}</${tag}>`,
        };
      },
    });
    const result = await build({
      root,
      handlers: fixtureHandler,
      assets: [integration("one", "first"), integration("two", "second")],
    });
    expect(result.files).toEqual(["index.html", "one.txt", "two.txt"]);
    expect(new Set(outs).size).toBe(2);
    expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe(
      "<second><first>page</first></second>",
    );
  }));

test("disposes integrations in reverse declaration order after publication", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const journal: string[] = [];
    const integration = (name: string): AssetIntegration => ({
      async prepare(context) {
        await mkdir(context.out);
        await writeFile(path.join(context.out, `${name}.txt`), name);
        return {
          directory: context.out,
          dispose() {
            expect(existsSync(path.join(root, "dist/index.html"))).toBe(true);
            journal.push(name);
          },
        };
      },
    });
    await build({
      root,
      handlers: fixtureHandler,
      assets: [integration("first"), integration("second")],
    });
    expect(journal).toEqual(["second", "first"]);
  }));

test("names the failing integration and disposes the integrations prepared before it", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const journal: string[] = [];
    const error = await capture(() =>
      build({
        root,
        handlers: fixtureHandler,
        assets: [
          {
            async prepare(context) {
              await mkdir(context.out);
              await writeFile(path.join(context.out, "first.txt"), "first");
              return {
                directory: context.out,
                dispose() {
                  journal.push("first");
                },
              };
            },
          },
          {
            prepare() {
              throw new Error("boom");
            },
          },
        ],
      }),
    );
    expect(error.reason).toBe("ASSETS_FAILED");
    expect(error.context["integration"]).toBe(2);
    expect(error.message).toContain("asset integration #2");
    expect(error.message).toContain("boom");
    expect(journal).toEqual(["first"]);
    expect((await readdir(root)).filter((name) => name.startsWith(".vincle-"))).toEqual([]);
  }));

test("rejects two module loader providers as an invalid configuration", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const journal: string[] = [];
    const integration = (name: string): AssetIntegration => ({
      async prepare(context) {
        return {
          directory: context.out,
          modules: { load: async () => ({}) },
          dispose() {
            journal.push(name);
          },
        };
      },
    });
    const error = await capture(() =>
      build({
        root,
        handlers: fixtureHandler,
        assets: [integration("first"), integration("second")],
      }),
    );
    expect(error.reason).toBe("INVALID_CONFIG");
    expect(error.message).toContain("provide modules");
    expect(error.message).toContain("#1, #2");
    expect(journal).toEqual(["second", "first"]);
  }));

test("rejects an entry without a prepare function", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const error = await capture(() =>
      build({ root, handlers: fixtureHandler, assets: [{} as AssetIntegration] }),
    );
    expect(error.reason).toBe("INVALID_CONFIG");
    expect(error.message).toContain("prepare() function");
    expect(existsSync(path.join(root, "dist"))).toBe(false);
  }));

test("resolves a relative asset directory from the project root", () =>
  fixture(async (root, put) => {
    await put("page.fixture", "fixture");
    const result = await build({
      root,
      handlers: fixtureHandler,
      assets: {
        async prepare() {
          await mkdir(path.join(root, "generated"), { recursive: true });
          await writeFile(path.join(root, "generated/rel.txt"), "relative");
          return { directory: "generated" };
        },
      },
    });
    expect(result.files).toEqual(["index.html", "rel.txt"]);
    expect(await readFile(path.join(root, "dist/rel.txt"), "utf8")).toBe("relative");
  }));

test("prepareAssets uses the integrations resolved for a development session", () =>
  fixture(async (root) => {
    let devCalls = 0;
    let prepareCalls = 0;
    const sessionDirectory = path.join(root, ".session");
    const sessionBuild = { directory: path.join(sessionDirectory, "0") };
    const resolved: AssetIntegration = {
      async dev() {
        devCalls++;
        return sessionBuild;
      },
      prepare() {
        throw new Error("dev must not prepare");
      },
    };
    const declared: AssetIntegration = {
      async prepare() {
        prepareCalls++;
        return { directory: path.join(sessionDirectory, "1") };
      },
    };
    const session: AssetSession = {
      integrations: [resolved],
      directory: sessionDirectory,
      prepared: new Map(),
      watch: () => {},
    };
    const result = await prepareAssets({
      assets: [declared],
      root,
      src: path.join(root, "src"),
      runtime: vincleRuntime,
      work: path.join(root, ".work"),
      session,
    });
    expect(devCalls).toBe(1);
    expect(prepareCalls).toBe(0);
    expect(result.builds).toEqual([sessionBuild]);
    expect(session.prepared.get(0)).toBe(sessionBuild);
  }));

test("disposes every build and returns the first failure", async () => {
  const journal: string[] = [];
  const buildOf = (name: string, fail = false) => ({
    directory: "/unused",
    dispose() {
      journal.push(name);
      if (fail) throw new Error("boom");
    },
  });
  const error = await disposeBuilds([buildOf("a"), buildOf("b", true), buildOf("c")]);
  expect(journal).toEqual(["c", "b", "a"]);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("boom");
});

test("releases an invalid development build before failing", () =>
  fixture(async (root) => {
    let disposeCalls = 0;
    const invalid: AssetIntegration = {
      async dev() {
        return {
          directory: "",
          dispose() {
            disposeCalls++;
          },
        };
      },
      prepare() {
        throw new Error("dev must not prepare");
      },
    };
    const session: AssetSession = {
      integrations: [invalid],
      directory: path.join(root, ".session"),
      prepared: new Map(),
      watch: () => {},
    };
    const error = await capture(() =>
      prepareAssets({
        assets: [invalid],
        root,
        src: path.join(root, "src"),
        runtime: vincleRuntime,
        work: path.join(root, ".work"),
        session,
      }),
    );
    expect(error.reason).toBe("INVALID_CONFIG");
    expect(disposeCalls).toBe(1);
    expect(session.prepared.size).toBe(0);
    expect(existsSync(path.join(root, "dist"))).toBe(false);
  }));
