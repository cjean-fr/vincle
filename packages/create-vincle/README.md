# create-vincle

Bootstrap a server-rendered Vincle project from the command line.

```sh
npm create vincle
bun create vincle
deno run -A npm:create-vincle
```

The CLI detects the runtime that started it and uses it as the default in the
interactive prompt. You can press Enter to keep that choice or select `Bun`,
`Node.js`, or `Deno`. The generated project contains the quick-start search page
from the Vincle guide, a matching HTTP server, and the TypeScript configuration
for the selected runtime.

## Usage

```text
create-vincle [directory]

Options:
  --runtime <auto|bun|deno|node>
  --name <name>
  --yes, -y
  --no-install
  --force
  --help, -h
  --version, -v
```

The default target is `vincle-app`. Dependencies are installed after generation:
`bun install` and `npm install` for Bun and Node, and `deno cache` for Deno. Use
`--no-install` to generate files only.

## Runtime templates

| Runtime | Server                 | Type-check command |
| ------- | ---------------------- | ------------------ |
| Bun     | `Bun.serve`            | `bun run check`    |
| Node.js | `node:http` with `tsx` | `npm run check`    |
| Deno    | `Deno.serve`           | `deno task check`  |

The Node.js template requires a recent Node.js release. Deno uses `deno.json`; Bun
and Node.js use `tsconfig.json` and `package.json`.

## License

MIT
