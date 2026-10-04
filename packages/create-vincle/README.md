# create-vincle

Bootstrap a server-rendered Vincle project for Bun, Node.js or Deno.
Generates a search page, an HTTP server and the matching TypeScript setup.

Under development; not published yet.

## Usage

From the repository root after `bun install`:

```sh
bun packages/create-vincle/src/bin.ts my-app
```

The prompt defaults to the runtime running the CLI. To skip prompts and
choose a runtime explicitly:

```sh
bun packages/create-vincle/src/bin.ts my-app --runtime node --yes
```

## Options

| Option                | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `--runtime <runtime>` | `auto` (default), `bun`, `deno` or `node`      |
| `--name <name>`       | Package name (default: directory name)         |
| `--yes`, `-y`         | Use defaults without prompts                   |
| `--no-install`        | Generate files without installing dependencies |
| `--force`             | Overwrite existing directory contents          |
| `--help`, `-h`        | Show help                                      |
| `--version`, `-v`     | Show version                                   |

The default directory is `vincle-app`. Dependencies are installed automatically.
Run `bun run dev`, `pnpm run dev`, `npm run dev` or `deno task dev` in the
generated project.
The Node.js template requires Node 22 or later.

[Getting started](https://vincle.cjean.fr/guide/getting-started/first-render)

MIT © Christophe Jean
