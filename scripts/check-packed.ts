import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dir = mkdtempSync(join(tmpdir(), "vincle-packed-"));
function run(cmd: string[], cwd: string) {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0)
    throw new Error(`${cmd.join(" ")}\n${result.stderr.toString()}\n${result.stdout.toString()}`);
  return result.stdout.toString();
}
try {
  const modules = join(dir, "node_modules");
  mkdirSync(join(modules, "@vincle"), { recursive: true });
  // External dependencies use the installed lockfile versions. Vincle packages
  // themselves are exclusively extracted tarballs, with no workspace fallback.
  function linkExternalModules(localModules: string) {
    if (!existsSync(localModules)) return;
    for (const entry of readdirSync(localModules)) {
      if (entry === "@vincle" || entry === "create-vincle" || entry.startsWith(".")) continue;
      if (entry.startsWith("@")) {
        mkdirSync(join(modules, entry), { recursive: true });
        for (const dependency of readdirSync(join(localModules, entry))) {
          const target = join(modules, entry, dependency);
          if (!existsSync(target)) symlinkSync(join(localModules, entry, dependency), target);
        }
      } else if (!existsSync(join(modules, entry))) {
        symlinkSync(join(localModules, entry), join(modules, entry));
      }
    }
  }
  linkExternalModules(join(root, "node_modules"));
  const manifests = [];
  for (const name of [
    "core",
    "flow",
    "vite-plugin",
    "precompile",
    "ssg",
    "eslint-plugin",
    "create-vincle",
  ]) {
    const source = join(root, "packages", name);
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    linkExternalModules(join(source, "node_modules"));
    const archive = join(dir, `${name}.tgz`);
    run(["bun", "pm", "pack", "--ignore-scripts", "--filename", archive], source);
    const target = join(modules, manifest.name);
    mkdirSync(target, { recursive: true });
    run(["tar", "-xzf", archive, "--strip-components=1", "-C", target], dir);
    const packed = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    for (const condition of Object.values(packed.exports ?? {}) as Array<
      string | Record<string, string>
    >) {
      for (const path of typeof condition === "string" ? [condition] : Object.values(condition)) {
        if (!existsSync(join(target, path)))
          throw new Error(`${manifest.name}: missing export ${path}`);
      }
    }
    for (const path of Object.values(packed.bin ?? {}) as string[]) {
      if (!existsSync(join(target, path)))
        throw new Error(`${manifest.name}: missing executable ${path}`);
    }
    manifests.push(packed);
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  const imports = manifests.flatMap((manifest) =>
    Object.keys(manifest.exports ?? {})
      .filter((key) => key !== "./package.json")
      .map((key) => (key === "." ? manifest.name : manifest.name + key.slice(1))),
  );
  writeFileSync(
    join(dir, "types.tsx"),
    imports
      .map((entry, i) => `import * as p${i} from ${JSON.stringify(entry)}; void p${i};`)
      .join("\n") +
      '\nimport {renderToString, createElement} from "@vincle/core"; void renderToString(<p>packed</p>); void createElement("p", null, "packed");\n' +
      'declare module "@vincle/ssg" { interface SsgMeta { customField?: string } }\n' +
      'import type {SsgPlugin} from "@vincle/ssg"; const plugin: SsgPlugin = {name:"types",metadata(context) { const value: string | undefined = context.meta.customField; void value; }}; void plugin;\n',
  );
  run(
    [
      "bun",
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--target",
      "esnext",
      "--module",
      "nodenext",
      "--jsx",
      "react-jsx",
      "--jsxImportSource",
      "@vincle/core",
      "types.tsx",
    ],
    dir,
  );
  mkdirSync(join(dir, "ssg-src"));
  writeFileSync(join(dir, "ssg-src/index.tsx"), "export default () => <h1>Packed SSG</h1>");
  writeFileSync(
    join(dir, "ssg-src/_layout.tsx"),
    "export default ({children}) => <main>{children}</main>",
  );
  writeFileSync(
    join(dir, "ssg-src/article.mdx"),
    "---\nsitemap: false\n---\n# Article\n\n<span>MDX</span>",
  );
  writeFileSync(
    join(dir, "ssg-src/data.json.ts"),
    "export default () => JSON.stringify({packed:true})",
  );
  writeFileSync(
    join(dir, "smoke.mjs"),
    `import {renderToString,createElement} from "@vincle/core";
import {jsx} from "@vincle/core/jsx-runtime";
import {build as buildSsg} from "@vincle/ssg";
import {readFile} from "node:fs/promises";
const root = new URL(".", import.meta.url);
await buildSsg({root:root.pathname, src:"ssg-src", out:"ssg-dist", site:"https://example.test/"});
if (await readFile(new URL("ssg-dist/index.html",root),"utf8") !== "<main><h1>Packed SSG</h1></main>") throw new Error("Packed SSG JSX/layout failed");
if (!(await readFile(new URL("ssg-dist/article/index.html",root),"utf8")).includes("<span>MDX</span>")) throw new Error("Packed MDX failed");
if ((await readFile(new URL("ssg-dist/sitemap.xml",root),"utf8")).includes("article")) throw new Error("Packed sitemap opt-out failed");
if (JSON.parse(await readFile(new URL("ssg-dist/data.json",root),"utf8")).packed !== true) throw new Error("Packed JSON failed");
if (await renderToString(jsx("p", {children: "<packed>"})) !== "<p>&lt;packed&gt;</p>") throw new Error("Packed rendering failed");
if (await renderToString(createElement("p",{children:"discarded"},"<fallback>")) !== "<p>&lt;fallback&gt;</p>") throw new Error("Packed createElement fallback failed");
${imports
  .filter((entry) => !entry.endsWith("/bun"))
  .map((entry) => `await import(${JSON.stringify(entry)});`)
  .join("\n")}`,
  );
  writeFileSync(
    join(dir, "ssg.config.ts"),
    `import {defineConfig} from "@vincle/ssg";
export default defineConfig({src:"ssg-src",out:"cli-dist",assets:false,site:"https://example.test",dev:{mimeTypes:{".custom":"application/custom"}}});`,
  );
  const packedSsg = manifests.find((manifest) => manifest.name === "@vincle/ssg");
  const packedCli = join(modules, "@vincle/ssg", packedSsg.bin.ssg);
  run(["bun", packedCli, "generate"], dir);
  if (!existsSync(join(dir, "cli-dist/index.html"))) throw new Error("Packed SSG CLI failed");
  if (Bun.which("node")) run(["node", packedCli, "generate"], dir);
  run(["bun", "--conditions=dist", "smoke.mjs"], dir);
  if (Bun.which("node")) run(["node", "smoke.mjs"], dir);
  console.log(
    "Tarball exports/declarations, imports and SSG builds passed in Bun/available Node for all packages.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
