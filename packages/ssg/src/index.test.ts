import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateSite } from "./index.js";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-site-test-"));
  roots.push(root);
  return { root, out: path.join(root, "dist") };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("writes text and binary, replaces obsolete files and preserves external assets", async () => {
  const { root, out } = await fixture();
  const publicDir = path.join(root, "public");
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, "favicon.svg"), "favicon");
  await mkdir(path.join(out, "assets"), { recursive: true });
  await writeFile(path.join(out, "assets/client.js"), "external");
  const options = { out, copy: [{ from: publicDir }], preserve: ["assets"] };
  await generateSite({ ...options, outputs: [{ path: "old/index.html", content: "old" }] });
  const result = await generateSite({
    ...options,
    outputs: [
      { path: "new/index.html", content: () => "new" },
      { path: "photo.bin", content: new Uint8Array([0, 255, 128]) },
      { path: "buffer.bin", content: new Uint8Array([42]).buffer },
    ],
  });
  expect(result.files).toEqual(["buffer.bin", "favicon.svg", "new/index.html", "photo.bin"]);
  expect(await readFile(path.join(out, "new/index.html"), "utf8")).toBe("new");
  expect([...(await readFile(path.join(out, "photo.bin")))]).toEqual([0, 255, 128]);
  expect([...(await readFile(path.join(out, "buffer.bin")))]).toEqual([42]);
  expect(await readFile(path.join(out, "assets/client.js"), "utf8")).toBe("external");
  expect(await readFile(path.join(out, "favicon.svg"), "utf8")).toBe("favicon");
  expect(await Bun.file(path.join(out, "old/index.html")).exists()).toBe(false);
});

test("production failure retains the old build and permits retry", async () => {
  const { out } = await fixture();
  await generateSite({ out, outputs: [{ path: "index.html", content: "previous" }] });
  await expect(
    generateSite({
      out,
      outputs: [
        { path: "partial.html", content: "partial" },
        {
          path: "broken.html",
          content: () => {
            throw new Error("producer failed");
          },
        },
      ],
    }),
  ).rejects.toThrow("broken.html");
  expect(await readFile(path.join(out, "index.html"), "utf8")).toBe("previous");
  expect(await Bun.file(path.join(out, "partial.html")).exists()).toBe(false);
  await generateSite({ out, outputs: [{ path: "index.html", content: "retry" }] });
  expect(await readFile(path.join(out, "index.html"), "utf8")).toBe("retry");
});

for (const name of [
  "../escape",
  "/absolute",
  "x/../escape",
  "x\\escape",
  "x//escape",
  "./x",
  "C:/escape",
  "",
]) {
  test(`rejects invalid output path ${JSON.stringify(name)}`, async () => {
    const { out } = await fixture();
    await expect(
      generateSite({ out, outputs: [{ path: name, content: "invalid" }] }),
    ).rejects.toThrow("Invalid relative output path");
  });
}

for (const paths of [
  ["same", "same"],
  ["a", "a/b"],
  ["a/b", "a"],
]) {
  test(`rejects colliding paths ${paths.join(", ")}`, async () => {
    const { out } = await fixture();
    await expect(
      generateSite({ out, outputs: paths.map((name) => ({ path: name, content: "x" })) }),
    ).rejects.toThrow();
  });
}

test("rejects collisions with copied and preserved files", async () => {
  const { root, out } = await fixture();
  const publicDir = path.join(root, "public");
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, "index.html"), "public");
  await expect(
    generateSite({
      out,
      copy: [{ from: publicDir }],
      outputs: [{ path: "index.html", content: "generated" }],
    }),
  ).rejects.toThrow();
  await expect(
    generateSite({
      out,
      preserve: ["assets"],
      outputs: [{ path: "assets/client.js", content: "generated" }],
    }),
  ).rejects.toThrow();
});

test("rejects symbolic output ancestors and symbolic copied files", async () => {
  const { root, out } = await fixture();
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "keep.txt"), "untouched");
  await symlink(outside, out);
  await expect(
    generateSite({ out, outputs: [{ path: "keep.txt", content: "bad" }] }),
  ).rejects.toThrow("real directory");
  await rm(out);
  const publicDir = path.join(root, "public");
  await mkdir(publicDir);
  await symlink(path.join(outside, "keep.txt"), path.join(publicDir, "link.txt"));
  await expect(generateSite({ out, copy: [{ from: publicDir }], outputs: [] })).rejects.toThrow(
    "symbolic link",
  );
  expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("untouched");
});

test("supports derived outputs from an async producer", async () => {
  const { out } = await fixture();
  async function* outputs() {
    const pages: string[] = [];
    for (const name of ["one", "two"]) {
      yield {
        path: `${name}.html`,
        content: () => {
          pages.push(name);
          return name;
        },
      };
    }
    yield { path: "search.json", content: JSON.stringify(pages) };
  }
  await generateSite({ out, outputs: outputs() });
  expect(JSON.parse(await readFile(path.join(out, "search.json"), "utf8"))).toEqual(["one", "two"]);
});
