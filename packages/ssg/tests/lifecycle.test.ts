import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, SsgError, type ModuleLoader, type SsgPlugin, type SsgMeta } from "../src/index.js";

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-phases-"));
  try {
    await mkdir(path.join(root, "src"));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("metadata → lazy render → materialized transform → prepared publication, in plugin order", () =>
  fixture(async (root) => {
    await writeFile(
      path.join(root, "src/index.tsx"),
      "export default ({meta}) => <h1>{meta.title}</h1>",
    );
    const events: string[] = [];
    let shared: SsgMeta = {};
    const first: SsgPlugin = {
      name: "first",
      metadata(ctx) {
        events.push("metadata:first");
        ctx.meta.title = "shared";
        shared = ctx.meta;
      },
      render(output, ctx) {
        events.push("render:first");
        expect(ctx.meta).toBe(shared);
        expect(typeof output.content).toBe("function");
        return output;
      },
      transform(output, ctx) {
        events.push("transform:first");
        expect(ctx.meta).toBe(shared);
        expect(output.content).toBe("<h1>shared</h1>");
        return { ...output, content: "<article>transformed</article>" };
      },
      async publish(site) {
        events.push("publish:first");
        expect(site.pages[0]!.meta).toBe(shared);
        expect(new TextDecoder().decode(await site.read("index.html"))).toBe(
          "<article>transformed</article>",
        );
        expect(await Bun.file(path.join(root, "dist/index.html")).exists()).toBe(false);
        await site.emit({
          path: "catalog.json",
          content: JSON.stringify(site.pages.map((page) => page.meta.title)),
        });
      },
    };
    const second: SsgPlugin = {
      name: "second",
      metadata() {
        events.push("metadata:second");
      },
      render() {
        events.push("render:second");
      },
      transform(output) {
        events.push("transform:second");
        expect(output.content).toBe("<article>transformed</article>");
      },
      publish(site) {
        events.push("publish:second");
        expect(site.files).toContain("catalog.json");
      },
    };
    await build({ root, plugins: [first, second] });
    expect(events).toEqual([
      "metadata:first",
      "metadata:second",
      "render:first",
      "render:second",
      "transform:first",
      "transform:second",
      "publish:first",
      "publish:second",
    ]);
    expect(JSON.parse(await readFile(path.join(root, "dist/catalog.json"), "utf8"))).toEqual([
      "shared",
    ]);
  }));

test("publish and transform failures remain actionable and preserve the previous build", () =>
  fixture(async (root) => {
    await writeFile(path.join(root, "src/index.tsx"), "export default () => <p>previous</p>");
    await build({ root });
    for (const hook of ["transform", "publish"] as const) {
      const plugin: SsgPlugin =
        hook === "transform"
          ? {
              name: "broken",
              transform() {
                throw new Error("transform failure");
              },
            }
          : {
              name: "broken",
              publish() {
                throw new Error("publication hook failure");
              },
            };
      try {
        await build({ root, plugins: [plugin] });
        throw new Error("expected failure");
      } catch (error) {
        expect(error).toBeInstanceOf(SsgError);
        if (!(error instanceof SsgError)) throw error;
        expect(error.reason).toBe("PLUGIN_FAILED");
        expect(error.context).toMatchObject({ plugin: "broken", hook });
      }
      expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toBe("<p>previous</p>");
    }
  }));

test("automatic layout lookup stays inside src for external custom sources", () =>
  fixture(async (root) => {
    const external = path.join(root, "external");
    await mkdir(external);
    await writeFile(path.join(root, "src/_layout.tsx"), "export default ({children}) => children");
    await writeFile(
      path.join(root, "_layout.tsx"),
      'throw new Error("poison root layout"); export default ({children}) => children',
    );
    await writeFile(
      path.join(external, "_layout.tsx"),
      'throw new Error("poison ancestor layout"); export default ({children}) => children',
    );
    await writeFile(
      path.join(external, "plain.tsx"),
      "export default ({children}) => <section>{children}</section>",
    );
    await writeFile(path.join(external, "auto.tsx"), "export default () => <p>auto</p>");
    await writeFile(
      path.join(external, "explicit.tsx"),
      'export const meta = { layout: "./plain.tsx" }; export default () => <p>explicit</p>',
    );
    const probes: string[] = [];
    const loads: string[] = [];
    const record = (modules: ModuleLoader): ModuleLoader => ({
      watchFile(file) {
        probes.push(file);
        modules.watchFile?.(file);
      },
      load(file, importSource, code) {
        loads.push(file);
        return modules.load(file, importSource, code);
      },
    });
    await build({
      root,
      assets: false,
      discover: async (_options, discover) => {
        const pages = await discover({ src: external });
        return pages.map((page) => {
          page.source = {
            ...page.source,
            src: path.join(root, "src"),
            modules: record(page.source.modules),
          };
          return page;
        });
      },
    });
    expect(await readFile(path.join(root, "dist/auto/index.html"), "utf8")).toBe("<p>auto</p>");
    expect(await readFile(path.join(root, "dist/explicit/index.html"), "utf8")).toBe(
      "<section><p>explicit</p></section>",
    );
    expect(probes).toEqual([]);
    expect(loads).toContain(path.join(external, "plain.tsx"));
    expect(loads.some((file) => path.basename(file) === "_layout.tsx")).toBe(false);
  }));
