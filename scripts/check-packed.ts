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
  for (const entry of readdirSync(join(root, "node_modules"))) {
    if (entry === "@vincle" || entry === "create-vincle") continue;
    symlinkSync(join(root, "node_modules", entry), join(modules, entry));
  }
  const manifests = [];
  for (const name of [
    "core",
    "flow",
    "vite-plugin",
    "precompile",
    "site",
    "eslint-plugin",
    "create-vincle",
  ]) {
    const source = join(root, "packages", name);
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    const localModules = join(source, "node_modules");
    if (existsSync(localModules))
      for (const entry of readdirSync(localModules)) {
        if (entry.startsWith("@") || entry.startsWith(".") || existsSync(join(modules, entry)))
          continue;
        symlinkSync(join(localModules, entry), join(modules, entry));
      }
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
      '\nimport {renderToString} from "@vincle/core"; void renderToString(<p>packed</p>);\n',
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
  writeFileSync(
    join(dir, "smoke.mjs"),
    `import {renderToString} from "@vincle/core";
import {jsx} from "@vincle/core/jsx-runtime";
if (await renderToString(jsx("p", {children: "<packed>"})) !== "<p>&lt;packed&gt;</p>") throw new Error("Packed rendering failed");
${imports
  .filter((entry) => !entry.endsWith("/bun"))
  .map((entry) => `await import(${JSON.stringify(entry)});`)
  .join("\n")}`,
  );
  run(["bun", "--conditions=dist", "smoke.mjs"], dir);
  if (Bun.which("node")) run(["node", "smoke.mjs"], dir);
  console.log(
    "Tarball exports, declarations and Bun/available Node imports passed for all packages.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
