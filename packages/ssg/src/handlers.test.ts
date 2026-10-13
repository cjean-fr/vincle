import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  discoverPages,
  renderPage,
  generateSite,
  type PageHandler,
  type RenderedOutput,
} from "./index.js";

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "vincle-handlers-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("one handler contract serves discovery, rendering and publication", () =>
  fixture(async (src) => {
    await mkdir(path.join(src, "nested"));
    await mkdir(path.join(src, "ignored"));
    for (const name of ["b.txt", "a.custom", "unknown.json", "nested/c.txt", "ignored/d.txt"])
      await writeFile(path.join(src, name), name);
    const handler: PageHandler = {
      name: "text",
      load(source) {
        expect(source.src).toBe(src);
        return {
          meta: { title: source.relativePath },
          render(context) {
            return { path: context.outputPath(".txt"), content: String(context.meta.title) };
          },
        };
      },
    };
    const pages = await discoverPages({
      src,
      handlers: { ".txt": handler, ".custom": handler },
      excludeDirectories: ["ignored"],
    });
    expect(pages.map((page) => page.source.route)).toEqual(["/a", "/b", "/nested/c"]);
    const outputs: RenderedOutput[] = [];
    for (const page of pages) for await (const output of renderPage(page)) outputs.push(output);
    expect((await generateSite({ out: path.join(src, "dist"), outputs })).files).toEqual([
      "a.txt",
      "b.txt",
      "nested/c.txt",
    ]);
  }));

test("bounded discovery drains in-flight handler loads after failure", () =>
  fixture(async (src) => {
    for (const name of ["a.txt", "b.txt", "c.txt"]) await writeFile(path.join(src, name), "");
    let active = 0;
    let maximum = 0;
    const started: string[] = [];
    const handler: PageHandler = {
      name: "test",
      async load({ file }) {
        started.push(path.basename(file));
        maximum = Math.max(maximum, ++active);
        try {
          await new Promise((resolve) => setTimeout(resolve, file.endsWith("a.txt") ? 1 : 15));
          if (file.endsWith("a.txt")) throw new Error("broken source");
          return { render: () => ({ path: "result.txt", content: file }) };
        } finally {
          active--;
        }
      },
    };
    await expect(
      discoverPages({ src, handlers: { ".txt": handler }, concurrency: 2 }),
    ).rejects.toThrow("broken source");
    expect(maximum).toBe(2);
    expect(active).toBe(0);
    expect(started).toEqual(["a.txt", "b.txt"]);
  }));

test("missing/empty roots and invalid discovery options", () =>
  fixture(async (src) => {
    await expect(discoverPages({ src: path.join(src, "missing") })).rejects.toThrow(
      "Source directory does not exist",
    );
    expect(await discoverPages({ src })).toEqual([]);
    for (const concurrency of [0, -1, 1.5, NaN, Infinity])
      await expect(discoverPages({ src, concurrency })).rejects.toThrow("positive integer");
    await expect(discoverPages({ src, handlers: { md: false } })).rejects.toThrow("extension");
  }));
