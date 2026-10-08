import { describe, expect, it } from "bun:test";

import { buildProjectFiles, CORE_VERSION } from "./templates.js";

function json(files: Record<string, string>, filename: string): Record<string, unknown> {
  return JSON.parse(files[filename] ?? "") as Record<string, unknown>;
}

function templateHandler(
  runtime: "node" | "deno" | "bun",
  render: (page: { query: string }) => Promise<string>,
): unknown {
  const source = buildProjectFiles(runtime, "demo")["server.tsx"]!;
  const callback = source.slice(
    source.indexOf(runtime === "node" ? "const server =" : "async function handleRequest("),
    source.indexOf(runtime === "node" ? "server.listen(" : 'console.log("Listening'),
  );
  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: JSON.stringify({ compilerOptions: { jsx: "react", jsxFactory: "jsx" } }),
  });
  // Execute the generated callback with a fake server: no socket is opened.
  return new Function(
    runtime === "node" ? "createServer" : runtime === "deno" ? "Deno" : "Bun",
    "renderToString",
    "Page",
    "jsx",
    "console",
    transpiler.transformSync(callback) + "\nreturn server;",
  )(
    runtime === "node"
      ? (handler: unknown) => handler
      : runtime === "deno"
        ? { serve: (_options: unknown, handler: unknown) => handler }
        : { serve: (options: { fetch: unknown }) => options.fetch },
    render,
    () => null,
    (_component: unknown, props: { query: string }) => props,
    { error() {} },
  );
}

function nodeHandler(render: (page: { query: string }) => Promise<string>) {
  return templateHandler("node", render) as (
    request: { url: string; headers: { host: string } },
    response: ReturnType<typeof nodeResponse>,
  ) => Promise<void>;
}

function fetchHandler(
  runtime: "bun" | "deno",
  render: (page: { query: string }) => Promise<string>,
) {
  return templateHandler(runtime, render) as (request: { url: string }) => Promise<Response>;
}

function nodeResponse() {
  return {
    status: 0,
    body: "",
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    writeHead(status: number) {
      if (this.headersSent) throw new Error("Headers already sent");
      this.status = status;
      this.headersSent = true;
    },
    end(body: string) {
      this.body = body;
      this.writableEnded = true;
    },
    destroy() {
      this.destroyed = true;
    },
  };
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
  it("reads the query without parsing the untrusted Host header", async () => {
    const handler = nodeHandler(async ({ query }) => query);
    const response = nodeResponse();

    await handler({ url: "/?q=Flow", headers: { host: "[" } }, response);

    expect(response.status).toBe(200);
    expect(response.body).toBe("<!DOCTYPE html>Flow");
  });

  it("returns 400 for a request URL that cannot be parsed, before rendering", async () => {
    let rendered = false;
    const handler = nodeHandler(async () => {
      rendered = true;
      return "page";
    });
    const response = nodeResponse();

    await handler({ url: "http://[", headers: { host: "localhost" } }, response);

    expect(response.status).toBe(400);
    expect(response.body).toBe("Bad Request");
    expect(rendered).toBe(false);
  });

  it("handles a rejected render and can handle the next request", async () => {
    let calls = 0;
    const handler = nodeHandler(async () => {
      if (calls++ === 0) throw new Error("private render details");
      return "page";
    });
    const request = { url: "/", headers: { host: "localhost" } };
    const failed = nodeResponse();
    await expect(handler(request, failed)).resolves.toBeUndefined();
    expect(failed.status).toBe(500);
    expect(failed.body).toBe("Internal Server Error");

    const next = nodeResponse();
    await handler(request, next);
    expect(next.status).toBe(200);
    expect(next.body).toBe("<!DOCTYPE html>page");
  });

  it("closes a partial response on failure without writing a second header", async () => {
    const handler = nodeHandler(async () => {
      throw new Error("render failed");
    });
    const response = nodeResponse();
    response.headersSent = true;

    await expect(
      handler({ url: "/", headers: { host: "localhost" } }, response),
    ).resolves.toBeUndefined();
    expect(response.destroyed).toBe(true);
    expect(response.status).toBe(0);
  });

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

for (const runtime of ["bun", "deno"] as const) {
  describe(`${runtime} request handling`, () => {
    it("renders the query with an HTML response", async () => {
      const handler = fetchHandler(runtime, async ({ query }) => query);
      const response = await handler(new Request("http://localhost:3000/?q=Flow"));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
      expect(await response.text()).toBe("<!DOCTYPE html>Flow");
    });

    it("returns 400 before rendering when URL parsing fails", async () => {
      let rendered = false;
      const handler = fetchHandler(runtime, async () => {
        rendered = true;
        return "page";
      });
      // Inject a malformed URL directly; this does not claim the runtime admits it over HTTP.
      const response = await handler({ url: "http://[" });

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(await response.text()).toBe("Bad Request");
      expect(rendered).toBe(false);
    });

    it("handles a rejected render without exposing details and handles the next request", async () => {
      let calls = 0;
      const handler = fetchHandler(runtime, async () => {
        if (calls++ === 0) throw new Error("private render details");
        return "page";
      });
      const request = new Request("http://localhost:3000/");
      const failed = await handler(request);
      expect(failed.status).toBe(500);
      expect(failed.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(await failed.text()).toBe("Internal Server Error");

      const next = await handler(request);
      expect(next.status).toBe(200);
      expect(await next.text()).toBe("<!DOCTYPE html>page");
    });
  });
}

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
