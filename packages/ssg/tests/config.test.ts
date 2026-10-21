import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadSsgConfig } from "../src/cli.js";
import { defineConfig } from "../src/config.js";

const roots: string[] = [];
async function root() {
  const directory = await mkdtemp(path.join(tmpdir(), "ssg-config-"));
  roots.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("defineConfig keeps object identity and contextually types sync/async factories", async () => {
  const config = {
    site: "https://example.test",
    dev: { mimeTypes: { ".custom": "application/custom" } },
  };
  expect(defineConfig(config)).toBe(config);
  const factory = defineConfig(async ({ command, mode }) => ({
    site: `https://${command}-${mode}.test`,
  }));
  expect(await factory({ command: "build", mode: "production" })).toEqual({
    site: "https://build-production.test",
  });
  const typeContracts = () => {
    // @ts-expect-error MIME mappings use dotted extension keys.
    defineConfig({ dev: { mimeTypes: { custom: "application/custom" } } });
    // @ts-expect-error dev.vite.server.port must be numeric.
    defineConfig({ dev: { vite: { server: { port: "4321" } } } });
    // @ts-expect-error unknown top-level options are rejected.
    defineConfig({ typo: true });
  };
  void typeContracts;
});
test("loads TypeScript helpers and async command/mode-specific configuration", async () => {
  const directory = await root();
  await writeFile(path.join(directory, "helper.ts"), 'export const site = "https://example.test";');
  await writeFile(
    path.join(directory, "ssg.config.ts"),
    'import {site} from "./helper.ts"; export default async ({command,mode}) => ({site, src: command === "build" ? "pages" : mode});',
  );
  expect(await loadSsgConfig(directory, { command: "build", mode: "production" })).toEqual({
    site: "https://example.test",
    src: "pages",
  });
});
test("defaults without a config and rejects explicit missing or invalid configurations", async () => {
  const directory = await root();
  expect(await loadSsgConfig(directory, { command: "serve", mode: "development" })).toEqual({});
  await expect(
    loadSsgConfig(directory, { command: "build", mode: "production" }, "missing.ts"),
  ).rejects.toMatchObject({ reason: "INVALID_CONFIG" });
  await writeFile(path.join(directory, "ssg.config.ts"), 'export default "invalid";');
  await expect(
    loadSsgConfig(directory, { command: "build", mode: "production" }),
  ).rejects.toMatchObject({ reason: "INVALID_CONFIG" });
});
