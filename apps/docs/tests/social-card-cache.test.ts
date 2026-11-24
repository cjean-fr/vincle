import { afterEach, beforeEach, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { socialCardPng, socialCardSvg } from "../src/lib/social-card.js";

const CARD = { title: "Getting started", section: "Guide", summary: "Install and render." };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "social-card-cache-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("serves a rendered card from the cache on the second call", async () => {
  const rendered = await socialCardPng(CARD, dir);
  const entries = await readdir(dir);
  expect(entries.length).toBe(1);

  // Prove the second call reads the entry rather than re-rendering: replace
  // it with a different, still valid PNG prologue and get those bytes back.
  const standIn = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  await writeFile(join(dir, entries[0]!), standIn);
  expect(new Uint8Array(await socialCardPng(CARD, dir))).toEqual(standIn);

  // A different card misses and renders anew.
  const other = await socialCardPng({ ...CARD, title: "Another page" }, dir);
  expect(other.length).toBeGreaterThan(standIn.length);
  expect(other.slice(0, 8)).toEqual(rendered.slice(0, 8));
});

it("re-renders over a cache entry that is not a PNG", async () => {
  const rendered = await socialCardPng(CARD, dir);
  const [entry] = await readdir(dir);
  await writeFile(join(dir, entry!), "not a png");
  expect(await socialCardPng(CARD, dir)).toEqual(rendered);
});

it("renders without a usable cache directory", async () => {
  // A file where the directory should be: mkdir and read both fail.
  const blocker = join(dir, "blocker");
  await writeFile(blocker, "file");
  const rendered = await socialCardPng(CARD, join(blocker, "cache"));
  expect(new Uint8Array(rendered)).toEqual(new Uint8Array(await socialCardPng(CARD, dir)));
});

it("keys the cache entry on the SVG alone", async () => {
  // The hash is the contract: same SVG, same card, whatever the page is.
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(socialCardSvg(CARD)).digest("hex").slice(0, 16);
  await socialCardPng(CARD, dir);
  expect(await readdir(dir)).toEqual([`${expected}.png`]);
  await readFile(join(dir, `${expected}.png`));
});
