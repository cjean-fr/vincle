import { expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { lastModified } from "../src/lib/page-history.js";

it("uses the last content commit, including nested pages, and ignores unrelated commits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-page-history-"));
  const pages = path.join(root, "pages");
  const git = (args: string[], date?: string) => {
    const proc = Bun.spawnSync(
      [
        "git",
        "-c",
        "user.name=Docs test",
        "-c",
        "user.email=docs-test@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        ...args,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (!proc.success) throw new Error(proc.stderr.toString());
  };
  try {
    await mkdir(path.join(pages, "guide"), { recursive: true });
    expect(await lastModified(pages)).toBeNull();
    git(["init", "--quiet"]);
    expect(await lastModified(pages)).toBeNull();
    await writeFile(path.join(pages, "index.mdx"), "Home");
    git(["add", "pages"]);
    git(["commit", "--quiet", "-m", "Home"], "2020-01-01T12:00:00Z");
    expect(Date.parse((await lastModified(pages)) ?? "")).toBe(Date.parse("2020-01-01T12:00:00Z"));
    await writeFile(path.join(pages, "guide/page.mdx"), "Nested page");
    git(["add", "pages"]);
    git(["commit", "--quiet", "-m", "Nested page"], "2021-02-03T12:00:00Z");
    expect(Date.parse((await lastModified(pages)) ?? "")).toBe(Date.parse("2021-02-03T12:00:00Z"));
    await writeFile(path.join(root, "unrelated.txt"), "Other work");
    git(["add", "unrelated.txt"]);
    git(["commit", "--quiet", "-m", "Other work"], "2022-04-05T12:00:00Z");
    expect(Date.parse((await lastModified(pages)) ?? "")).toBe(Date.parse("2021-02-03T12:00:00Z"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
