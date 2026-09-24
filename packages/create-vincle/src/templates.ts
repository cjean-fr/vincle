import { runtimeDevCommand, type Runtime } from "./runtime";

export const CORE_VERSION = "0.9.0";
export const BUN_TYPES_VERSION = "^1.4.2";
export const NODE_TYPES_VERSION = "^26.6.2";
export const TSX_VERSION = "^4.23.15";
export const TYPESCRIPT_VERSION = "^6.0.3";

const page = `import { renderToString } from "@vincle/core";

const guides = [
  {
    title: "Getting started with Vincle",
    href: "https://vincle.cjean.fr/guide/getting-started/first-render",
  },
  {
    title: "Streaming HTML with Flow",
    href: "https://vincle.cjean.fr/integration/first-stream",
  },
];

function Results({ query }: { query: string }) {
  const matches = guides.filter((guide) =>
    guide.title.toLowerCase().includes(query.toLowerCase()),
  );

  if (matches.length === 0) {
    return <p>No guides found. Try “Vincle” or “Flow”.</p>;
  }

  return (
    <ul>
      {matches.map((guide) => (
        <li>
          <a href={guide.href}>{guide.title}</a>
        </li>
      ))}
    </ul>
  );
}

function Page({ query }: { query: string }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Find a guide</title>
      </head>
      <body>
        <main>
          <h1>Find a guide</h1>
          <form action="/" method="get">
            <label for="query">Search guides</label>
            <input id="query" name="q" value={query} />
            <button type="submit">Search</button>
          </form>
          <h2>Results for {query}</h2>
          <Results query={query} />
        </main>
      </body>
    </html>
  );
}
`;

const bunServer = `${page}
const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "Vincle";
    const html = await renderToString(<Page query={query} />);

    return new Response("<!DOCTYPE html>" + html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log("Listening on " + server.url);
`;

const denoServer = `${page}
const server = Deno.serve({ port: 3000 }, async (request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "Vincle";
  const html = await renderToString(<Page query={query} />);

  return new Response("<!DOCTYPE html>" + html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

console.log("Listening on http://localhost:" + server.addr.port);
`;

const nodeServer = `import { createServer } from "node:http";
${page}
const server = createServer(async (request, response) => {
  const host = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "/", "http://" + host);
  const query = url.searchParams.get("q") ?? "Vincle";
  const html = await renderToString(<Page query={query} />);

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!DOCTYPE html>" + html);
});

server.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
`;

const gitignore = `node_modules/
.DS_Store
dist/
coverage/
`;

function packageJson(name: string, runtime: Runtime): string {
  if (runtime === "bun") {
    return `${JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: {
          dev: "bun --watch server.tsx",
          start: "bun server.tsx",
          check: "tsc --noEmit",
        },
        dependencies: {
          "@vincle/core": `^${CORE_VERSION}`,
        },
        devDependencies: {
          "@types/bun": BUN_TYPES_VERSION,
          typescript: TYPESCRIPT_VERSION,
        },
      },
      null,
      2,
    )}\n`;
  }

  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        dev: "tsx watch server.tsx",
        start: "tsx server.tsx",
        check: "tsc --noEmit",
      },
      dependencies: {
        "@vincle/core": `^${CORE_VERSION}`,
      },
      devDependencies: {
        "@types/node": NODE_TYPES_VERSION,
        tsx: TSX_VERSION,
        typescript: TYPESCRIPT_VERSION,
      },
      engines: {
        node: ">=22.0.0",
      },
    },
    null,
    2,
  )}\n`;
}

function tsconfig(runtime: Runtime): string {
  if (runtime === "node") {
    return `${JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "react-jsx",
          jsxImportSource: "@vincle/core",
          types: ["node"],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["server.tsx"],
      },
      null,
      2,
    )}\n`;
  }

  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        jsxImportSource: "@vincle/core",
        types: ["bun"],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["server.tsx"],
    },
    null,
    2,
  )}\n`;
}

function denoJson(): string {
  const coreSpecifier = `npm:@vincle/core@${CORE_VERSION}`;
  return `${JSON.stringify(
    {
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: coreSpecifier,
        strict: true,
        skipLibCheck: true,
      },
      imports: {
        "@vincle/core": coreSpecifier,
      },
      tasks: {
        dev: "deno run --allow-net --watch server.tsx",
        start: "deno run --allow-net server.tsx",
        check: "deno check server.tsx",
      },
    },
    null,
    2,
  )}\n`;
}

function readme(name: string, runtime: Runtime): string {
  const run = runtimeDevCommand(runtime);
  const check =
    runtime === "deno" ? "deno task check" : `${runtime === "bun" ? "bun" : "npm"} run check`;
  return `# ${name}

A server-rendered Vincle application.

## Run

\`\`\`sh
${run}
\`\`\`

Check the types with:

\`\`\`sh
${check}
\`\`\`

Open http://localhost:3000 after starting the server.
`;
}

export function buildProjectFiles(runtime: Runtime, name: string): Record<string, string> {
  if (runtime === "bun") {
    return {
      "server.tsx": bunServer,
      "package.json": packageJson(name, runtime),
      "tsconfig.json": tsconfig(runtime),
      "README.md": readme(name, runtime),
      ".gitignore": gitignore,
    };
  }

  if (runtime === "deno") {
    return {
      "server.tsx": denoServer,
      "deno.json": denoJson(),
      "README.md": readme(name, runtime),
      ".gitignore": gitignore,
    };
  }

  return {
    "server.tsx": nodeServer,
    "package.json": packageJson(name, runtime),
    "tsconfig.json": tsconfig(runtime),
    "README.md": readme(name, runtime),
    ".gitignore": gitignore,
  };
}
