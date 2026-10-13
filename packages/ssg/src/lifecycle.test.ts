import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, SsgError, type SsgPlugin, type SsgMeta } from "./index.js";

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
