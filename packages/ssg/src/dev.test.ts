import { expect, test, spyOn } from "bun:test";
import fs from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isRunnableDevEnvironment } from "vite";

import type { PageContext } from "./types.js";

import { dev } from "./dev.js";

test("serves generated outputs, injects Vite, rebuilds watched sources and retains the last successful output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-dev-test-"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist/keep.txt"), "published");
  const source = path.join(root, "src/index.ts");
  await writeFile(source, 'export default "<html><head></head><body>first</body></html>"');
  const options = {
    root,
    assets: false as const,
    vite: {
      configFile: false as const,
      logLevel: "silent" as const,
      server: { host: "127.0.0.1", port: 0, watch: { usePolling: true, interval: 50 } },
    },
  };
  const server = await dev(options);
  try {
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected listening server");
    const url = `http://127.0.0.1:${address.port}/`;
    const initial = await (await fetch(url)).text();
    expect(initial).toContain("first");
    expect(initial).toContain("/@vite/client");
    await writeFile(source, 'export default "<html><head></head><body>second</body></html>"');
    let updated = "";
    for (let i = 0; i < 100; i++) {
      updated = await (await fetch(url)).text();
      if (updated.includes("second")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(updated).toContain("second");
    await writeFile(path.join(root, "src/data.json.ts"), 'export default "data"');
    await server.rebuild();
    expect(await (await fetch(url + "data.json")).text()).toBe("data");
    await writeFile(source, 'throw new Error("broken source"); export default "bad"');
    await expect(server.rebuild()).rejects.toMatchObject({ code: "ERR_VINCLE_SSG_BUILD" });
    expect(await (await fetch(url)).text()).toContain("second");
    await writeFile(source, 'export default "<html><head></head><body>recovered</body></html>"');
    await server.rebuild();
    expect(await (await fetch(url)).text()).toContain("recovered");
    expect(await readFile(path.join(root, "dist/keep.txt"), "utf8")).toBe("published");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("dev keeps one serve graph, invalidates imports/layouts/MDX and serves source assets", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-dev-test-"));
  const src = path.join(root, "src");
  await mkdir(path.join(src, "_client"), { recursive: true });
  await writeFile(path.join(src, "_client/main.ts"), 'console.log("client development")');
  await writeFile(
    path.join(src, "_shared.ts"),
    'let calls = 0; export const label = "first"; export const next = () => ++calls;',
  );
  await writeFile(
    path.join(src, "_layout.tsx"),
    "export default ({children}) => <html><head></head><body><header>layout-one</header>{children}</body></html>",
  );
  await writeFile(
    path.join(src, "index.tsx"),
    'import {Asset} from "@vincle/vite-plugin"; import {label,next} from "@shared"; const count = next(); export default () => <article><Asset entry="src/_client/main.ts"/><p>{label}:{count}:SERVER_MARKER</p></article>',
  );
  const mdx = path.join(src, "guide.mdx");
  await writeFile(mdx, 'import {label} from "@shared"\n\n# Guide one\n\n<p>{label}</p>');
  const commands: string[] = [];
  let starts = 0;
  const server = await dev({
    root,
    vite: {
      configFile: false,
      logLevel: "silent",
      base: "/docs/",
      resolve: { alias: { "@shared": path.join(src, "_shared.ts") } },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        {
          name: "serve-only",
          apply: "serve",
          config(_config, env) {
            commands.push(env.command);
          },
          configureServer() {
            starts++;
          },
          transform(code) {
            return code.includes("SERVER_MARKER")
              ? code.replaceAll("SERVER_MARKER", "serve-plugin")
              : undefined;
          },
        },
        {
          name: "build-only",
          apply: "build",
          transform() {
            throw new Error("Build plugin entered dev pipeline");
          },
        },
      ],
    },
  });
  try {
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected HTTP server");
    const base = `http://127.0.0.1:${address.port}/docs/`;
    const html = () => fetch(base).then((response) => response.text());
    expect(await html()).toContain("first:1:serve-plugin");
    expect(await html()).toContain('src="/docs/src/_client/main.ts"');
    expect(await (await fetch(base + "src/_client/main.ts")).text()).toContain(
      "client development",
    );
    await server.rebuild();
    expect(await html()).toContain("first:1:serve-plugin");
    await writeFile(
      path.join(src, "_shared.ts"),
      'let calls = 0; export const label = "second"; export const next = () => ++calls;',
    );
    await server.rebuild();
    expect(await html()).toContain("second:1:serve-plugin");
    expect(await (await fetch(base + "guide/")).text()).toContain("second");
    await writeFile(
      path.join(src, "_layout.tsx"),
      "export default ({children}) => <html><head></head><body><header>layout-two</header>{children}</body></html>",
    );
    await writeFile(mdx, "# Guide two\n\nUpdated MDX");
    await server.rebuild();
    expect(await html()).toContain("layout-two");
    const guide = await (await fetch(base + "guide/")).text();
    expect(guide).toContain("Guide two");
    expect(guide).toContain("layout-two");
    expect(commands).toEqual(["serve"]);
    expect(starts).toBe(1);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("deleted pages release native and MDX graph entries and can be recreated", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-dev-memory-"));
  const src = path.join(root, "src");
  await mkdir(src);
  await writeFile(path.join(src, "index.ts"), 'export default "index"');
  const server = await dev({
    root,
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    const env = server.vite.environments["ssr"]!;
    if (!isRunnableDevEnvironment(env)) throw new Error("Expected runnable environment");
    const rawUrls: unknown = Reflect.get(env.moduleGraph, "_unresolvedUrlToModuleMap");
    if (!(rawUrls instanceof Map)) throw new Error("Expected Vite raw URL cache");
    const counts = () => [
      rawUrls.size,
      env.moduleGraph.idToModuleMap.size,
      env.moduleGraph.urlToModuleMap.size,
      env.moduleGraph.fileToModulesMap.size,
      env.runner.evaluatedModules.idToModuleMap.size,
      env.runner.evaluatedModules.urlToIdModuleMap.size,
      env.runner.evaluatedModules.fileToModulesMap.size,
    ];
    // Warm shared runtime dependencies before recording the baseline.
    await writeFile(path.join(src, "warm.mdx"), "# Warm");
    await server.rebuild();
    await rm(path.join(src, "warm.mdx"));
    await server.rebuild();
    const baseline = counts();
    for (let i = 0; i < 12; i++) {
      const native = path.join(src, `entry-${i}.ts`);
      const mdx = path.join(src, `article-${i}.mdx`);
      await writeFile(native, `export default "native ${i}"`);
      await writeFile(mdx, `# Article ${i}`);
      await server.rebuild();
      expect(counts()[0]).toBeGreaterThan(baseline[0]!);
      await rm(native);
      await rm(mdx);
      await server.rebuild();
      expect(counts()).toEqual(baseline);
    }
    await writeFile(path.join(src, "entry-0.ts"), 'export default "recreated native"');
    await writeFile(path.join(src, "article-0.mdx"), "# Recreated MDX");
    await server.rebuild();
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected HTTP server");
    const base = `http://127.0.0.1:${address.port}/`;
    expect(await (await fetch(base + "entry-0/")).text()).toContain("recreated native");
    expect(await (await fetch(base + "article-0/")).text()).toContain("Recreated MDX");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("coalesces rebuild bursts into one pending regeneration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-dev-burst-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), 'export default "index"');
  let publishes = 0;
  let release: (() => void) | undefined;
  let enter: (() => void) | undefined;
  let gated = false;
  const started = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await dev({
    root,
    plugins: [
      {
        name: "gate",
        async publish() {
          publishes++;
          if (gated) {
            gated = false;
            enter!();
            await gate;
          }
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    gated = true;
    const first = server.rebuild();
    await started;
    const requests = Array.from({ length: 100 }, () => server.rebuild());
    for (const request of requests) expect(request).toBe(first);
    release!();
    await Promise.all([first, ...requests]);
    expect(publishes).toBe(3); // Initial build, active build, one pending build.
  } finally {
    release!();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("incremental rendering isolates pages, tracks raw data and nearest layouts, and republishes the full catalog", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-incremental-"));
  const src = path.join(root, "src");
  await mkdir(path.join(src, "one"), { recursive: true });
  await mkdir(path.join(src, "two"));
  await writeFile(
    path.join(src, "_state.ts"),
    "export const counts = {}; export function hit(id) { counts[id] = (counts[id] ?? 0) + 1; return counts[id]; }",
  );
  await writeFile(
    path.join(src, "_layout.tsx"),
    "export default ({children}) => <html><head></head><body>ROOT-ONE{children}</body></html>",
  );
  await writeFile(path.join(src, "_data.json"), '{"text":"DATA-ONE"}');
  const a = (title: string) =>
    `import {hit} from "../_state"; import {readFile} from "node:fs/promises"; export const meta = {title:"${title}"}; export default async (ctx) => { ctx.watch("../_data.json"); const data = JSON.parse(await readFile(new URL("../_data.json", import.meta.url), "utf8")); return <p>{hit("a")}:{data.text}:${title}</p>; };`;
  await writeFile(path.join(src, "one/a.tsx"), a("A"));
  await writeFile(
    path.join(src, "two/b.tsx"),
    'import {hit} from "../_state"; export const meta={title:"B"}; export default () => <p>{hit("b")}:B</p>',
  );
  await writeFile(
    path.join(src, "guide.mdx"),
    'import {hit} from "./_state"\n\n# Guide\n\n{hit("mdx")}',
  );
  let publications = 0;
  let publishedOut = "";
  let fail = false;
  const hooks: Record<string, number> = {};
  const server = await dev({
    root,
    site: "https://example.com",
    plugins: [
      {
        name: "catalog",
        incremental: true,
        metadata(ctx) {
          hooks[ctx.relativePath] = (hooks[ctx.relativePath] ?? 0) + 1;
        },
        async publish(ctx) {
          publications++;
          publishedOut = ctx.out;
          expect(new TextDecoder().decode(await ctx.read("two/b/index.html"))).toContain(":B");
          expect(ctx.outputs).toHaveLength(ctx.pages.length);
          const finalB = ctx.outputs.find((output) => output.url === "/two/b/")!;
          expect(await finalB.read()).toContain(":B");
          expect(finalB.meta.title).toBe("B");
          if (fail) throw new Error("publication failed");
          await ctx.emit({
            path: "catalog.json",
            content: JSON.stringify(ctx.pages.map((page) => page.meta.title ?? page.route)),
          });
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    const env = server.vite.environments["ssr"]!;
    if (!isRunnableDevEnvironment(env)) throw new Error("Expected runner");
    const state = await env.runner.import<{ counts: Record<string, number> }>(
      path.join(src, "_state.ts"),
    );
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected HTTP server");
    const base = `http://127.0.0.1:${address.port}/`;
    const get = (route: string) => fetch(base + route).then((r) => r.text());
    expect(state.counts).toEqual({ a: 1, b: 1, mdx: 1 });
    const stableNames = ["two/b/index.html", "sitemap.xml", "catalog.json"];
    const stableStats = await Promise.all(
      stableNames.map((name) => lstat(path.join(publishedOut, name))),
    );
    await server.rebuild();
    const warmStats = await Promise.all(
      stableNames.map((name) => lstat(path.join(publishedOut, name))),
    );
    expect(warmStats.map((info) => [info.ino, info.mtimeMs])).toEqual(
      stableStats.map((info) => [info.ino, info.mtimeMs]),
    );
    expect(state.counts).toEqual({ a: 1, b: 1, mdx: 1 });
    expect(hooks["two/b.tsx"]).toBe(1);
    expect(publications).toBe(2);
    await writeFile(path.join(src, "one/a.tsx"), a("A-UPDATED"));
    await server.rebuild();
    expect(state.counts).toEqual({ a: 2, b: 1, mdx: 1 });
    expect((await lstat(path.join(publishedOut, "two/b/index.html"))).ino).toBe(
      stableStats[0]!.ino,
    );
    expect((await lstat(path.join(publishedOut, "sitemap.xml"))).ino).toBe(stableStats[1]!.ino);
    expect(await get("catalog.json")).toContain("A-UPDATED");
    await writeFile(path.join(src, "_data.json"), '{"text":"DATA-TWO"}');
    await server.rebuild();
    expect(state.counts).toEqual({ a: 3, b: 1, mdx: 1 });
    expect(await get("one/a/")).toContain("DATA-TWO");
    await writeFile(
      path.join(src, "one/_layout.tsx"),
      "export default ({children}) => <html><head></head><body>LOCAL{children}</body></html>",
    );
    await server.rebuild();
    expect(state.counts).toEqual({ a: 4, b: 1, mdx: 1 });
    expect(await get("one/a/")).toContain("LOCAL");
    await writeFile(
      path.join(src, "_layout.tsx"),
      "export default ({children}) => <html><head></head><body>ROOT-TWO{children}</body></html>",
    );
    await server.rebuild();
    expect(state.counts).toEqual({ a: 4, b: 2, mdx: 2 });
    expect(await get("two/b/")).toContain("ROOT-TWO");
    fail = true;
    await writeFile(path.join(src, "one/a.tsx"), a("RETRY"));
    await expect(server.rebuild()).rejects.toMatchObject({ reason: "PLUGIN_FAILED" });
    expect(await get("one/a/")).toContain("A-UPDATED");
    fail = false;
    await server.rebuild();
    expect(state.counts).toEqual({ a: 6, b: 2, mdx: 2 });
    expect(await get("one/a/")).toContain("RETRY");
    await rm(path.join(src, "guide.mdx"));
    await server.rebuild();
    expect((await fetch(base + "guide/")).status).toBe(404);
    expect(await get("sitemap.xml")).not.toContain("guide");
    expect(await get("catalog.json")).toContain("RETRY");
    await server.rebuild({ force: true });
    expect(state.counts).toEqual({ a: 7, b: 3, mdx: 2 });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("custom handlers and page plugins are conservative unless opted into incremental rendering", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-incremental-policy-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/a.custom"), "custom");
  await writeFile(path.join(root, "src/b.safe"), "safe");
  await writeFile(
    path.join(root, "src/index.ts"),
    "export const meta={incremental:false}; let count=0; export const getCount=()=>count; export default()=>String(++count)",
  );
  const counts = { custom: 0, safe: 0, hooks: 0 };
  const server = await dev({
    root,
    handlers: {
      ".custom": {
        name: "custom",
        load(source) {
          return {
            render() {
              counts.custom++;
              return { path: source.outputPath(), content: "custom" };
            },
          };
        },
      },
      ".safe": {
        name: "safe",
        incremental: true,
        load(source) {
          return {
            render() {
              counts.safe++;
              return { path: source.outputPath(), content: "safe" };
            },
          };
        },
      },
    },
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    await server.rebuild();
    expect(counts).toEqual({ custom: 2, safe: 1, hooks: 0 });
    const env = server.vite.environments["ssr"]!;
    if (!isRunnableDevEnvironment(env)) throw new Error("Expected runner");
    const dynamic = await env.runner.import<{ getCount(): number }>(
      path.join(root, "src/index.ts"),
    );
    expect(dynamic.getCount()).toBe(2);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
  const secondRoot = await mkdtemp(path.join(tmpdir(), "vincle-incremental-plugins-"));
  await mkdir(path.join(secondRoot, "src"));
  await writeFile(path.join(secondRoot, "src/index.ts"), 'export default "page"');
  const global = await dev({
    root: secondRoot,
    plugins: [
      {
        name: "global",
        metadata() {
          counts.hooks++;
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    await global.rebuild();
    expect(counts.hooks).toBe(2);
  } finally {
    await global.close();
    await rm(secondRoot, { recursive: true, force: true });
  }
}, 20_000);

test("incremental multiple outputs remove obsolete files, preserve binary content and validate collisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-incremental-outputs-"));
  await mkdir(path.join(root, "src"));
  const source = path.join(root, "src/bundle.ts");
  await writeFile(
    source,
    'export default () => [{path:"old.html",content:"old"},{path:"image.bin",content:new Uint8Array([0,255,7])}]',
  );
  const server = await dev({
    root,
    site: "https://example.com",
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected HTTP server");
    const base = `http://127.0.0.1:${address.port}/`;
    await server.rebuild();
    expect(new Uint8Array(await (await fetch(base + "image.bin")).arrayBuffer())).toEqual(
      new Uint8Array([0, 255, 7]),
    );
    await writeFile(
      source,
      'export default () => [{path:"new.html",content:"new"},{path:"data.json",content:"{}"}]',
    );
    await server.rebuild();
    expect((await fetch(base + "old.html")).status).toBe(404);
    expect((await fetch(base + "image.bin")).status).toBe(404);
    expect(await (await fetch(base + "new.html")).text()).toContain("new");
    const sitemap = await (await fetch(base + "sitemap.xml")).text();
    expect(sitemap).toContain("new.html");
    expect(sitemap).not.toContain("old.html");
    await writeFile(
      path.join(root, "src/collision.ts"),
      'export default {path:"new.html",content:"collision"}',
    );
    await expect(server.rebuild()).rejects.toMatchObject({ reason: "OUTPUT_COLLISION" });
    expect(await (await fetch(base + "new.html")).text()).toContain("new");
    await rm(path.join(root, "src/collision.ts"));
    await server.rebuild();
    expect(await (await fetch(base + "data.json")).text()).toBe("{}");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("Vite restart invalidates rendered pages and reattaches the source watcher", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-incremental-restart-"));
  await mkdir(path.join(root, "src"));
  const source = path.join(root, "src/index.ts");
  await writeFile(source, 'export default "DEV-VALUE"');
  let replacement = "before";
  const server = await dev({
    root,
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: { usePolling: true, interval: 50 } },
      plugins: [
        {
          name: "replace",
          apply: "serve",
          transform(code) {
            return code.includes("DEV-VALUE")
              ? code.replaceAll("DEV-VALUE", replacement)
              : undefined;
          },
        },
      ],
    },
  });
  const url = () => {
    const addr = server.vite.httpServer!.address();
    if (!addr || typeof addr === "string") throw new Error("Expected HTTP server");
    return `http://127.0.0.1:${addr.port}/`;
  };
  try {
    expect(await (await fetch(url())).text()).toContain("before");
    replacement = "after";
    await server.vite.restart();
    await server.rebuild();
    expect(await (await fetch(url())).text()).toContain("after");
    await writeFile(source, 'export default "watched after restart"');
    let text = "";
    for (let i = 0; i < 100; i++) {
      text = await (await fetch(url())).text();
      if (text.includes("watched after restart")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(text).toContain("watched after restart");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("watches declared external data and catches edits arriving during publication", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-incremental-data-"));
  const external = await mkdtemp(path.join(tmpdir(), "vincle-incremental-external-"));
  const input = path.join(external, "data.txt");
  await writeFile(input, "FIRST-DATA");
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src/index.ts"),
    `import {readFile} from "node:fs/promises";export default async(ctx)=>{ctx.watch(${JSON.stringify(input)});return readFile(${JSON.stringify(input)},"utf8");}`,
  );
  let gated = false;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((r) => {
    enter = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const server = await dev({
    root,
    plugins: [
      {
        name: "gate",
        async publish() {
          if (gated) {
            gated = false;
            enter();
            await gate;
          }
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: { usePolling: true, interval: 30 } },
    },
  });
  const address = server.vite.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("Expected HTTP server");
  const base = `http://127.0.0.1:${address.port}/`;
  try {
    await new Promise((r) => setTimeout(r, 100));
    await writeFile(input, "SECOND-DATA");
    let html = "";
    for (let i = 0; i < 100; i++) {
      html = await (await fetch(base)).text();
      if (html.includes("SECOND-DATA")) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(html).toContain("SECOND-DATA");
    gated = true;
    const pending = server.rebuild();
    await entered;
    await writeFile(input, "LATE-DATA");
    release();
    await pending;
    expect(await (await fetch(base)).text()).toContain("LATE-DATA");
  } finally {
    release();
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
}, 20_000);

test("cached binary outputs snapshot Buffer bytes independently of producer mutations", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-incremental-buffer-"));
  await mkdir(path.join(root, "src"));
  const source = path.join(root, "src/index.ts");
  await writeFile(
    source,
    'import {Buffer} from "node:buffer";export const bytes=Buffer.from([1,2]);export default()=>({path:"data.bin",content:bytes});',
  );
  const server = await dev({
    root,
    plugins: [
      {
        name: "mutate",
        async publish(ctx) {
          const page = ctx.pages[0]!;
          const { bytes } = await page.modules.load(source, page.runtime.importSource);
          if (bytes instanceof Uint8Array) bytes.fill(9);
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    const addr = server.vite.httpServer!.address();
    if (!addr || typeof addr === "string") throw new Error("Expected HTTP server");
    const url = `http://127.0.0.1:${addr.port}/data.bin`;
    expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    await server.rebuild();
    expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("dev defaults use loopback and PORT, with explicit options taking precedence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-dev-defaults-"));
  const previous = process.env["PORT"];
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/index.ts"), 'export default "hello"');
    process.env["PORT"] = "0";
    const server = await dev({ root, vite: { configFile: false, logLevel: "silent" } });
    try {
      expect(server.vite.config.server.host).toBe("127.0.0.1");
      expect(server.vite.config.server.port).toBeGreaterThan(0);
      const address = server.vite.httpServer!.address();
      expect(address).toMatchObject({ address: "127.0.0.1" });
    } finally {
      await server.close();
    }
    process.env["PORT"] = "4321";
    const override = await dev({
      root,
      vite: { configFile: false, logLevel: "silent", server: { port: 0 } },
    });
    try {
      expect(override.vite.config.server.port).not.toBe(4321);
    } finally {
      await override.close();
    }
  } finally {
    if (previous === undefined) delete process.env["PORT"];
    else process.env["PORT"] = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("ENOSPC switches dev to polling and excludes private tooling directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-watcher-limit-"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, ".aws/cache"), { recursive: true });
  await writeFile(path.join(root, ".aws/cache/unused.json"), "{}");
  const file = path.join(root, "src/index.ts");
  await writeFile(file, 'export default "<html><body>before limit</body></html>"');
  const server = await dev({
    root,
    vite: { configFile: false, logLevel: "silent", server: { port: 0 } },
  });
  try {
    server.vite.watcher.emit(
      "error",
      Object.assign(new Error("System limit for number of file watchers reached"), {
        code: "ENOSPC",
      }),
    );
    for (let i = 0; i < 100; i++) {
      if (server.vite.config.server.watch && server.vite.config.server.watch.usePolling) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(server.vite.config.server.watch && server.vite.config.server.watch.usePolling).toBe(
      true,
    );
    for (let i = 0; i < 100 && !server.vite.httpServer?.listening; i++)
      await new Promise((resolve) => setTimeout(resolve, 25));
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected restarted HTTP server");
    const url = `http://127.0.0.1:${address.port}/`;
    await writeFile(file, 'export default "<html><body>after limit</body></html>"');
    let html = "";
    for (let i = 0; i < 100; i++) {
      html = await (await fetch(url)).text();
      if (html.includes("after limit")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(html).toContain("after limit");
    const activeWatcher = server.vite.watcher;
    await server.close();
    expect(Object.keys(activeWatcher.getWatched())).toHaveLength(0);
    expect(
      Object.keys(server.vite.watcher.getWatched()).some((directory) =>
        directory.includes("/.aws"),
      ),
    ).toBe(false);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("dev detects native watcher exhaustion before starting Vite", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vincle-watcher-probe-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), 'export default "hello"');
  const native = spyOn(fs, "watch").mockImplementation(() => {
    throw Object.assign(new Error("native watch exhausted"), { code: "ENOSPC" });
  });
  try {
    const server = await dev({
      root,
      vite: { configFile: false, logLevel: "silent", server: { port: 0 } },
    });
    try {
      expect(server.vite.config.server.watch && server.vite.config.server.watch.usePolling).toBe(
        true,
      );
      expect(native).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  } finally {
    native.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});

test("custom discovery retains incremental pages, catalog keys and dependencies across failed rebuilds", async () => {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-custom-discovery-"));
  const src = path.join(root, "src");
  await mkdir(src);
  const a = path.join(src, "a.mdx");
  const shared = path.join(src, "_shared.txt");
  await writeFile(a, "---\ntitle: A\n---\n# First");
  await writeFile(path.join(src, "b.mdx"), "---\ntitle: B\n---\n# Stable");
  await writeFile(shared, "one");
  await writeFile(
    path.join(src, "_layout.tsx"),
    "export default ({children,meta}) => <main data-version={meta.renderKey}>{children}</main>",
  );
  let version = "one";
  let fail = false;
  const rendered: string[] = [];
  const server = await dev({
    root,
    async discover(options, discover) {
      const pages = await discover(options);
      const key = JSON.stringify([
        version,
        pages.map((page) => [page.source.route, page.meta.title]),
      ]);
      return pages.map((page) =>
        Object.assign({}, page, {
          meta: { ...page.meta, renderKey: key },
          render(context: PageContext) {
            if (version === "two") context.watch(shared);
            return page.render(context);
          },
        }),
      );
    },
    plugins: [
      {
        name: "incremental-probe",
        incremental: true,
        metadata(context) {
          rendered.push(context.route);
        },
        async publish(context) {
          if (fail) throw new Error("failed publication");
          await context.emit({
            path: "catalog.json",
            content: JSON.stringify(context.pages.map((page) => page.meta.title)),
          });
        },
      },
    ],
    vite: {
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, watch: null },
    },
  });
  try {
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Expected listening server");
    const get = (name: string) =>
      fetch(`http://127.0.0.1:${address.port}/${name}`).then((response) => response.text());
    expect(rendered.splice(0)).toEqual(["/a", "/b"]);
    await server.rebuild();
    expect(rendered.splice(0)).toEqual([]);
    await writeFile(a, "---\ntitle: A\n---\n# Changed");
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/a"]);
    expect(await get("a/")).toContain("Changed");
    expect(await get("a.md")).toBe("---\ntitle: A\n---\n# Changed");
    version = "two";
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/a", "/b"]);
    expect(await get("b/")).toContain("two");
    await server.rebuild();
    expect(rendered.splice(0)).toEqual([]);
    // A dependency first registered while re-rendering a cached source stays tracked.
    await writeFile(shared, "two");
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/a", "/b"]);
    await writeFile(a, "---\ntitle: Renamed\n---\n# Retry");
    fail = true;
    await expect(server.rebuild()).rejects.toMatchObject({ reason: "PLUGIN_FAILED" });
    expect(await get("a/")).toContain("Changed");
    fail = false;
    rendered.length = 0;
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/a", "/b"]);
    expect(await get("a/")).toContain("Retry");
    expect(JSON.parse(await get("catalog.json"))).toEqual(["Renamed", "B"]);
    await writeFile(path.join(src, "c.mdx"), "---\ntitle: C\n---\n# Added");
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/a", "/b", "/c"]);
    await rm(a);
    await server.rebuild();
    expect(rendered.splice(0)).toEqual(["/b", "/c"]);
    expect(JSON.parse(await get("catalog.json"))).toEqual(["B", "C"]);
    await server.rebuild();
    expect(rendered).toEqual([]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
