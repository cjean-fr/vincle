import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

const roots: string[] = [];
const bin = path.resolve(import.meta.dirname, "../bin.js");
async function fixture() {
  const root = await mkdtemp(path.join(import.meta.dirname, "../.ssg-cli-test-"));
  roots.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src/index.ts"),
    'export default "<html><head></head><body>CLI first</body></html>";',
  );
  await writeFile(
    path.join(root, "ssg.config.ts"),
    'import {defineConfig} from "@vincle/ssg"; export default defineConfig(({mode})=>({site:"https://example.test",assets:false,dev:{vite:{server:{host:"127.0.0.1",port:0,watch:{usePolling:true,interval:50}}}}}));',
  );
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function command(args: string[], cwd: string) {
  const child = Bun.spawn([process.execPath, bin, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

test("compiled CLI builds TypeScript configuration and diagnoses bad commands/configs", async () => {
  const root = await fixture();
  expect((await command(["--help"], root)).stdout).toContain("ssg <dev|build>");
  const result = await command(["build"], root);
  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/^1 page generated in \d+(?: ms|\.\d\d s)$/m);
  expect(await readFile(path.join(root, "dist/index.html"), "utf8")).toContain("CLI first");
  expect(await readFile(path.join(root, "dist/sitemap.xml"), "utf8")).toContain(
    "https://example.test/",
  );
  expect((await command(["unknown"], root)).code).toBe(1);
  expect((await command(["dev", "--port", "abc"], root)).stderr).toContain("--port must be");
  const missing = await command(["build", "--config", "missing.ts"], root);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("INVALID_CONFIG");
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  test(`CLI dev watches sources and removes temporary output on ${signal}`, async () => {
    const root = await fixture();
    const temporary = await mkdtemp(path.join(tmpdir(), "ssg-cli-temp-"));
    roots.push(temporary);
    const before = (await readdir(temporary)).filter((name) => name.startsWith("vincle-dev-"));
    const child = spawn(process.execPath, [bin, "dev"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TMPDIR: temporary },
    });
    const exited = once(child, "exit");
    let output = "";
    let timeout: ReturnType<typeof setTimeout>;
    try {
      await new Promise<void>((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("CLI dev startup timed out")), 10000);
        const receive = (chunk: Buffer) => {
          output += chunk.toString();
          if (stripVTControlCharacters(output).includes("Local:")) resolve();
        };
        child.stdout.on("data", receive);
        child.stderr.on("data", receive);
        child.once("error", reject);
        child.once("exit", () => reject(new Error(output)));
      });
      clearTimeout(timeout!);
      const url = stripVTControlCharacters(output).match(
        /http:\/\/(?:localhost|127\.0\.0\.1):\d+\//,
      )?.[0];
      expect(url).toBeDefined();
      expect(await (await fetch(url!)).text()).toContain("CLI first");
      await writeFile(
        path.join(root, "src/index.ts"),
        'export default "<html><body>CLI changed</body></html>";',
      );
      let html = "";
      for (let i = 0; i < 100; i++) {
        html = await (await fetch(url!)).text();
        if (html.includes("CLI changed")) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(html).toContain("CLI changed");
      child.kill(signal);
      await exited;
      expect((await readdir(root)).some((name) => name.startsWith(".vincle-"))).toBe(false);
      expect(
        (await readdir(temporary)).filter((name) => name.startsWith("vincle-dev-")).toSorted(),
      ).toEqual(before.toSorted());
      expect(output).not.toMatch(/page reload .*vincle-dev-/);
    } finally {
      clearTimeout(timeout!);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
    }
  }, 15000);
