import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { dev } from "../src/dev.js";
import { resolveMimeTypes } from "../src/mime.js";

test("serves Markdown, JPEG XL, uppercase extensions and custom/overridden media types", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ssg-mime-test-"));
  let server;
  try {
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "public"));
    await writeFile(
      path.join(root, "src/index.ts"),
      'export default "<html><body>home</body></html>"',
    );
    for (const name of ["guide.md", "photo.JXL", "file.custom", "404.html"])
      await writeFile(path.join(root, "public", name), "content");
    server = await dev({
      root,
      notFound: "/404.html",
      redirects: { "/old": "/" },
      statuses: { "/404.html": 404 },
      mimeTypes: { ".custom": "application/custom", ".md": "text/markdown; charset=utf-8" },
      vite: {
        configFile: false,
        logLevel: "silent",
        server: { host: "127.0.0.1", port: 0, watch: null },
      },
    });
    const address = server.vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    const origin = `http://127.0.0.1:${address.port}`;
    const cases: Array<[string, string]> = [
      ["guide.md", "text/markdown; charset=utf-8"],
      ["photo.JXL", "image/jxl"],
      ["file.custom", "application/custom"],
    ];
    for (const [file, type] of cases) {
      const response = await fetch(`${origin}/${file}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(type);
    }
    expect((await fetch(`${origin}/missing`)).status).toBe(404);
    const redirect = await fetch(`${origin}/old`, { redirect: "manual" });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("Location")).toBe("/");
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("MIME configuration rejects invalid keys and header injection", () => {
  expect(() => resolveMimeTypes({ ".bad": "text/plain\r\nX-Injected: yes" })).toThrow(
    "Invalid MIME",
  );
});
