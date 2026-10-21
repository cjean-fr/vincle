import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateSiteCached, PublicationCache } from "../src/outputs.js";

test("incremental publication preserves unchanged files, copies and derived outputs and removes obsolete paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-publish-"));
  const out = path.join(root, "out");
  const source = path.join(root, "public");
  const cache = new PublicationCache();
  await mkdir(source);
  await writeFile(path.join(source, "asset.txt"), "asset");
  let version = "first";
  let obsolete = true;
  let calls = 0;
  const publish = () =>
    generateSiteCached(
      {
        out,
        copy: [{ from: source }],
        outputs: [
          { path: "index.html", content: "unchanged" },
          { path: "page.html", content: version },
          { path: "data.bin", content: new Uint8Array([1, 2, 3]) },
          ...(obsolete ? [{ path: "nested/deleted.txt", content: "old" }] : []),
        ],
        async beforePublish(site) {
          calls++;
          if (calls < 4) expect(site.files).toContain("asset.txt");
          expect(new TextDecoder().decode(await site.read("index.html"))).toBe("unchanged");
          expect(new TextDecoder().decode(await site.read("page.html"))).toBe(version);
          await site.emit({ path: "derived.txt", content: "constant" });
        },
      },
      cache,
    );
  try {
    await publish();
    const names = ["index.html", "asset.txt", "data.bin", "derived.txt"];
    const before = await Promise.all(names.map((name) => lstat(path.join(out, name))));
    const changedBefore = await lstat(path.join(out, "page.html"));
    version = "second";
    obsolete = false;
    await publish();
    const after = await Promise.all(names.map((name) => lstat(path.join(out, name))));
    expect(after.map((info) => [info.ino, info.mtimeMs])).toEqual(
      before.map((info) => [info.ino, info.mtimeMs]),
    );
    expect((await lstat(path.join(out, "page.html"))).ino).not.toBe(changedBefore.ino);
    expect(await readFile(path.join(out, "page.html"), "utf8")).toBe("second");
    expect(await lstat(path.join(out, "nested")).catch(() => null)).toBeNull();
    expect(calls).toBe(2);
    await writeFile(path.join(source, "asset.txt"), "new asset");
    await publish();
    expect(await readFile(path.join(out, "asset.txt"), "utf8")).toBe("new asset");
    await rm(path.join(source, "asset.txt"));
    await publish();
    expect(await lstat(path.join(out, "asset.txt")).catch(() => null)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("partial publication validates cached collisions, preserves failed preparation and handles file/directory transitions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-publish-"));
  const out = path.join(root, "out");
  const cache = new PublicationCache();
  const publish = (name: string, value: string) =>
    generateSiteCached({ out, outputs: [{ path: name, content: value }] }, cache);
  try {
    await publish("route", "first");
    await expect(
      generateSiteCached(
        {
          out,
          outputs: [
            { path: "route", content: "first" },
            { path: "route/child", content: "collision" },
          ],
        },
        cache,
      ),
    ).rejects.toMatchObject({ reason: "OUTPUT_COLLISION" });
    await expect(
      generateSiteCached(
        {
          out,
          outputs: [{ path: "route", content: "changed" }],
          beforePublish() {
            throw new Error("plugin failed");
          },
        },
        cache,
      ),
    ).rejects.toMatchObject({ reason: "PREPARATION_FAILED" });
    expect(await readFile(path.join(out, "route"), "utf8")).toBe("first");
    await publish("route/child", "child");
    expect(await readFile(path.join(out, "route/child"), "utf8")).toBe("child");
    await publish("route", "file again");
    expect(await readFile(path.join(out, "route"), "utf8")).toBe("file again");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication failures discard the snapshot so recovery republishes all files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-publish-"));
  const out = path.join(root, "out");
  const cache = new PublicationCache();
  let version = "first";
  const publish = () =>
    generateSiteCached(
      {
        out,
        outputs: [
          { path: "stable.txt", content: "stable" },
          { path: "changed.txt", content: version },
        ],
      },
      cache,
    );
  try {
    await publish();
    await rm(path.join(out, "changed.txt"));
    await symlink(path.join(root, "external.txt"), path.join(out, "changed.txt"));
    version = "second";
    await expect(publish()).rejects.toMatchObject({
      reason: "INVALID_OUTPUT",
      context: { phase: "publish" },
    });
    expect(cache.ready).toBe(false);
    await rm(path.join(out, "stable.txt"));
    await publish();
    expect(await readFile(path.join(out, "stable.txt"), "utf8")).toBe("stable");
    expect(await readFile(path.join(out, "changed.txt"), "utf8")).toBe("second");
    expect((await lstat(path.join(out, "changed.txt"))).isSymbolicLink()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
