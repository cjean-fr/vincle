import { describe, expect, it } from "bun:test";

import { buildProjectFiles, CORE_VERSION } from "./templates.js";

function json(files: Record<string, string>, filename: string): Record<string, unknown> {
  return JSON.parse(files[filename] ?? "") as Record<string, unknown>;
}

describe("Bun template", () => {
  it("generates a Bun server and matching TypeScript config", () => {
    const files = buildProjectFiles("bun", "demo");
    const config = json(files, "tsconfig.json");
    const packageFile = json(files, "package.json");

    expect(files["server.tsx"]).toContain("Bun.serve");
    expect(files["server.tsx"]).not.toContain("node:http");
    expect(config["compilerOptions"]).toMatchObject({
      jsx: "react-jsx",
      jsxImportSource: "@vincle/core",
      types: ["bun"],
    });
    expect(packageFile["scripts"]).toMatchObject({ dev: "bun --watch server.tsx" });
  });
});

describe("Node template", () => {
  it("generates a Node server with a tsx execution path", () => {
    const files = buildProjectFiles("node", "demo");
    const config = json(files, "tsconfig.json");
    const packageFile = json(files, "package.json");

    expect(files["server.tsx"]).toContain('from "node:http"');
    expect(files["server.tsx"]).not.toContain("Bun.serve");
    expect(config["compilerOptions"]).toMatchObject({
      module: "NodeNext",
      moduleResolution: "NodeNext",
      jsx: "react-jsx",
      jsxImportSource: "@vincle/core",
      types: ["node"],
    });
    expect(packageFile["scripts"]).toMatchObject({ dev: "tsx watch server.tsx" });
  });
});

describe("Deno template", () => {
  it("generates a native Deno config instead of a tsconfig", () => {
    const files = buildProjectFiles("deno", "demo");
    const config = json(files, "deno.json");

    expect(files["server.tsx"]).toContain("Deno.serve");
    expect(files["server.tsx"]).toContain("server.addr.port");
    expect(files["tsconfig.json"]).toBeUndefined();
    expect(config["compilerOptions"]).toMatchObject({
      jsx: "react-jsx",
      jsxImportSource: `npm:@vincle/core@${CORE_VERSION}`,
    });
    expect(config["imports"]).toEqual({ "@vincle/core": `npm:@vincle/core@${CORE_VERSION}` });
    expect(config["tasks"]).toMatchObject({ check: "deno check server.tsx" });
  });
});

describe("shared template", () => {
  it("keeps the quick-start page in every runtime", () => {
    for (const runtime of ["bun", "node", "deno"] as const) {
      const files = buildProjectFiles(runtime, "demo");
      expect(files["server.tsx"]).toContain("<h1>Find a guide</h1>");
      expect(files["server.tsx"]).toContain("renderToString(<Page query={query} />)");
      expect(files["README.md"]).toContain("Open http://localhost:3000");
    }
  });
});
