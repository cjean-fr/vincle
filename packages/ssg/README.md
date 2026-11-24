# @vincle/ssg

Static generation from a project's file hierarchy. Use conventions first:

```ts
import { build } from "@vincle/ssg";

await build();
```

The project root is the current directory. Routes live in `src/pages/` when present (otherwise `src/` for existing projects), outputs go to
`dist/`, and `public/` is copied to the output root. No configuration is needed
for JavaScript, TypeScript, JSX, TSX, Markdown or MDX. Private files/directories
starting with `_` or `.` and test/declaration files are not routes; use these for
shared components, layouts and helpers. Eligible non-private symbolic source entries are followed; broken or cyclic links fail discovery.

| Source                        | Route            | Default output                                           |
| ----------------------------- | ---------------- | -------------------------------------------------------- |
| `src/pages/index.tsx`         | `/`              | `dist/index.html`                                        |
| `src/pages/about.jsx`         | `/about`         | `dist/about/index.html`                                  |
| `src/pages/guide/index.md`    | `/guide`         | `dist/guide/index.html`, `dist/guide.md`                 |
| `src/pages/guide/article.mdx` | `/guide/article` | `dist/guide/article/index.html`, `dist/guide/article.md` |
| `src/pages/data.json.ts`      | `/data.json`     | `dist/data.json` when returning text or bytes            |
| `src/pages/robots.txt.js`     | `/robots.txt`    | `dist/robots.txt` when returning text or bytes           |

HTML uses directory indexes. Markdown alternates retain the exact source,
including MDX syntax. There is no browser runtime or hydration added by SSG.

## CLI and typed configuration

Install `@vincle/ssg`, then use its `ssg` executable:

```json
{ "scripts": { "dev": "ssg dev", "build": "ssg generate" } }
```

The CLI automatically loads `ssg.config.ts` (also `.mts`, `.js`, `.mjs`,
`.cts` and `.cjs`). With no file, the source/output/public conventions apply.
`--config`, `--root` and `--mode` override configuration discovery; `ssg dev`
also accepts `--port` and `--host`. Run `ssg --help` for usage.

```ts
// ssg.config.ts
import { defineConfig } from "@vincle/ssg";

export default defineConfig({
  site: "https://example.com",
  dev: {
    vite: { server: { port: 4321 } },
    notFound: "/404.html",
    statuses: { "/404.html": 404 },
    redirects: { "/old": "/new" },
    mimeTypes: {
      ".custom": "application/vnd.example.custom",
      ".md": "text/markdown; charset=utf-8",
    },
  },
});
```

`defineConfig` is an identity helper with typed `SsgConfig`, `SsgConfigEnv`
and `SsgConfigFactory` exports. It accepts a plain object, a promise, or a
sync/async function receiving `{ command, mode }`; command is `serve` for dev
and `build` for production, matching Vite. Shared fields use `SsgOptions`;
`dev` is development-only. Vite asset settings still belong in `vite.config`.
Projects whose renderers use Bun APIs run the executable with
`bun run --bun ssg dev` / `bun run --bun ssg generate`; the package CLI also works with Node.

Dev output lives in the OS temporary directory, outside Vite's watched project.
Both `DevServer.close()` and `server.vite.close()` perform full SSG cleanup;
the CLI handles SIGINT/SIGTERM. SIGKILL cannot be intercepted. Configuration
is read on startup; restart the CLI after changing `ssg.config`.

### Extending formats and media types

`handlers` registers source-format loaders/producers (see Other runtimes and
handlers below). `dev.mimeTypes` adds or overrides HTTP content types for generated
and copied files. Keys include their leading dot and match case-insensitively.
Built-ins include `.jxl` → `image/jxl` and `.md` → `text/markdown; charset=utf-8`;
`defaultMimeTypes` and `MimeTypes` are public exports. Unknown files fall back to
`application/octet-stream`. Invalid extensions/media types fail with
`INVALID_CONFIG`. Production content types are controlled by the deployment server.

## Pages and layouts

JSX/TSX files export a default component. Components can be async with Vincle.
Metadata is exported as `meta` and passed to components, layouts and plugins.

```tsx
// src/index.tsx
export const meta = { title: "Home" };
export default function Home() {
  return <h1>Hello</h1>;
}
```

The nearest `_layout.tsx` in the source's directory or an ancestor wraps JSX,
TSX, Markdown and MDX rendering. `_layout.jsx`, `_layout.ts` and `_layout.js` also
work; TSX is the preferred convention. A layout in a subdirectory **replaces**
the inherited layout. For composition, import another layout explicitly.

```tsx
// src/_layout.tsx
import type { JSX } from "@vincle/core";
import type { SsgMeta } from "@vincle/ssg";

export default function Layout({ children, meta }: { children: JSX.Element; meta: SsgMeta }) {
  return (
    <html>
      <head>
        <title>{meta.title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

A page can override the convention with `meta.layout: "./_layouts/plain.tsx"`
(relative to that page's source file), or `meta.layout: false` to omit the layout.
Markdown/MDX use the same values in YAML frontmatter. Non-HTML and source Markdown
outputs are unaffected by layouts. A custom handler uses `context.runtime.render`
to participate in the selected layout and runtime.

## Beta

`@vincle/ssg` is in beta: it already builds the Vincle documentation site, but
the API keeps improving and small breaking changes are still possible between
releases. Pin the exact version you install.

## Documentation

- [SSG overview](https://vincle.cjean.fr/integration/ssg/overview): conventions, routes, URLs
- [Concepts](https://vincle.cjean.fr/integration/ssg/concepts): producers and multiple outputs, plugins, sitemap, publication and errors, custom runtimes and handlers
- [Pages & layouts](https://vincle.cjean.fr/integration/ssg/pages): formats, metadata, layouts, client assets
- [Configuration](https://vincle.cjean.fr/integration/ssg/configuration): `ssg.config.ts`, CLI options, plugins, Vite assets
- [Images](https://vincle.cjean.fr/integration/ssg/images): generated variants, `<Picture>`, converters
- [Build a blog](https://vincle.cjean.fr/integration/ssg/blog): listings, tags and a feed
- [Deployment](https://vincle.cjean.fr/integration/ssg/deployment): hosts, error page, content types, caching
