# create-vincle

Bootstrap a server-rendered Vincle project from the command line.

```sh
npm create vincle
bun create vincle
deno run -A npm:create-vincle
```

The CLI detects the runtime that started it and uses it as the default in the
interactive prompt. You can press Enter to keep that choice or select `Bun`,
`Node.js`, or `Deno`. The generated project contains the quick-start search
page from the Vincle guide, a matching HTTP server, and the TypeScript
configuration for the selected runtime.

## Usage

```text
create-vincle [directory]

Options:
  --runtime <auto|bun|deno|node>   Runtime to target
  --name <name>                    Project/package name (default: directory name)
  --yes, -y                        Use defaults, skip prompts
  --no-install                     Generate files only, skip dependency install
  --force                        Overwrite existing directory contents
  --help, -h                     Show help
  --version, -v                  Show version
```

The default target directory is `vincle-app`. Dependencies are installed after
generation: `bun install` and `npm install` for Bun and Node, and `deno cache`
for Deno. Use `--no-install` to generate files only.

## Generated project

Every generated project contains the same search-page component from the Vincle
guide, wired to a minimal HTTP server. The file layout depends on the runtime.

### Bun

```
my-vincle-app/
├── server.tsx          # HTTP server + search page component
├── package.json        # @vincle/core + typescript + @types/bun
├── tsconfig.json       # JSX: react-jsx, jsxImportSource: @vincle/core
├── .gitignore
└── README.md
```

- **Dev**: `bun run dev` — watch mode via `bun --watch server.tsx`
- **Start**: `bun server.tsx`
- **Type-check**: `bun run check` (`tsc --noEmit`)

### Node.js

```
my-vincle-app/
├── server.tsx          # HTTP server (node:http) + search page component
├── package.json        # @vincle/core + typescript + tsx + @types/node
├── tsconfig.json       # JSX: react-jsx, jsxImportSource: @vincle/core
├── .gitignore
└── README.md
```

- **Dev**: `npm run dev` — watch mode via `tsx watch server.tsx`
- **Start**: `npm start` (`tsx server.tsx`)
- **Type-check**: `npm run check` (`tsc --noEmit`)

Node.js requires Node ≥ 22. The template uses the standard `node:http` module;
no Express or Fastify dependency.

### Deno

```
my-vincle-app/
├── server.tsx          # HTTP server (Deno.serve) + search page component
├── deno.json           # @vincle/core via npm: scope, deno tasks
├── .gitignore
└── README.md
```

- **Dev**: `deno task dev` — watch mode via `deno run --allow-net --watch`
- **Start**: `deno task start`
- **Type-check**: `deno task check` (`deno check server.tsx`)

Deno uses `deno.json` with `@vincle/core` imported from the npm scope.

## TypeScript configuration

All templates enable JSX transform (`react-jsx`) and set `jsxImportSource` to
`@vincle/core` so JSX expressions resolve to the vincle runtime.

| Setting            | Bun            | Node.js        | Deno               |
| ------------------ | -------------- | -------------- | ------------------ |
| `jsx`              | `react-jsx`    | `react-jsx`    | `react-jsx`        |
| `jsxImportSource`  | `@vincle/core` | `@vincle/core` | `npm:@vincle/core` |
| `module`           | `Preserve`     | `NodeNext`     | —                  |
| `moduleResolution` | `Bundler`      | `NodeNext`     | —                  |
| `types`            | `["bun"]`      | `["node"]`     | —                  |
| `target`           | `ESNext`       | `ESNext`       | —                  |

The TypeScript compiler is a peer dependency: it is included in the generated
project but not required at runtime. The package ships its own per-element
attribute types, so `@types/react` is not needed.

## Search page

The generated page is a simple search that filters Vincle guide titles. It
demonstrates:

- Async component fetching data (`guides` list)
- Typed props (`{ query: string }`)
- Form with `<form action="/" method="get">`
- Conditional rendering (empty results)
- Complete HTML document structure (`<html>`, `<head>`, `<body>`)

## Runtime detection

The CLI detects the runtime from the host environment and pre-selects it in the
prompt. Detection follows this order: `Bun.version` → `Deno.version` → `process.versions.node`.
If no runtime is detected, the user is prompted to choose.

## --yes flag

Pass `--yes` (or `-y`) to skip the interactive prompt and use the detected
runtime. Combined with `--name`, it creates a project in a single command:

```sh
npm create vincle my-app -- --yes --name my-app
```

## License

MIT
