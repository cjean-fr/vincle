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

## Producers and multiple outputs

JS/TS modules export text, bytes, an output, an iterable of outputs, or a function
returning them. Functions can be async; async generators are supported. Text or
bytes use the route's existing suffix (`data.json.ts`) or HTML otherwise. Explicit
outputs choose relative file paths independently of their source route.

```ts
// src/images/photo.ts
import type { PageContext } from "@vincle/ssg";

import { resizePhoto } from "./_resize.js";

export const meta = { title: "Photo", sitemap: false };
export default async function* ({ route }: PageContext) {
  for (const width of [320, 640, 1280]) {
    yield {
      path: `${route.slice(1)}-${width}.jpg`,
      content: () => resizePhoto(width), // returns Uint8Array/ArrayBuffer
    };
  }
}
```

JSX/TSX and MDX files can also export `outputs` alongside their default component.
This value (or function receiving `PageContext`) supplies additional outputs;
for example, a page can export a JSON metadata file as well as its HTML:

```ts
export const outputs = ({ outputPath, meta }) => ({
  path: outputPath(".json"),
  content: JSON.stringify(meta),
});
```

`content` is a string, `Uint8Array` or `ArrayBuffer`, or a function returning one.
Output paths cannot escape `dist/`; copied/generated file collisions are errors.
Image encoding/resizing is supplied by the producer's chosen image library.
Module text/binary producers are not JSX components and do not apply layouts.

## Shared metadata, plugins and sitemap

`SsgMeta` is common to all formats. Markdown/MDX frontmatter and module `meta`
exports populate `context.meta`; custom handlers return the same metadata shape.
It supports custom fields and TypeScript module augmentation. Plugins run in configuration order within four explicit phases:

1. `metadata(context)` enriches shared metadata before layouts/rendering.
2. `render(output, context)` adjusts lazy output producers before evaluation.
3. `transform(output, context)` receives concrete text/binary content after rendering.
4. `publish(site)` inspects prepared files and can emit derived files before any
   published output is replaced. It can read every page's metadata through `site.pages`.

A failing hook aborts publication and identifies the plugin and phase in its
diagnostic. Components and layouts also
receive `meta`. An MDX `meta` export overrides matching frontmatter fields.

```ts
await build({
  site: "https://example.com/",
  plugins: [
    {
      name: "titles",
      metadata(context) {
        context.meta.title ??= context.route === "/" ? "Home" : context.route;
      },
      transform(output, context) {
        // All outputs, including Markdown and binary files, share context.meta.
        return output;
      },
    },
  ],
});
```

Setting `site` enables `sitemap.xml`. Sitemaps split automatically at 50,000 URLs
or 52,428,800 uncompressed UTF-8 bytes, counting XML escaping and tags. When
multiple files are needed, `sitemap.xml` becomes an index referencing
`sitemap-1.xml`, `sitemap-2.xml`, etc. The index is checked against the same
entry and byte limits. By default, generated HTML outputs are
included; other outputs are excluded. Set `meta.sitemap: false` per source (or
`sitemap: false` in frontmatter). An output's `sitemap` overrides that source
setting, including for JSON/images when explicitly enabled. `export const sitemap
= false` is also accepted. Use `output.url` when its public URL differs from its
file path. To serve the site under a prefix, set `site` to the origin and
`base` to the prefix (`site: "https://example.com", base: "/docs/"`); included
paths are resolved under it. A path in `site` alone is still accepted, but not
together with `base`. `build({ sitemap: false })` disables sitemap generation globally.

Source discovery follows symbolic links to files and directories. Routes and
layout lookup use the link's location; module imports use the bundler's native
resolution (the target location by default). Directory cycles and broken links
fail discovery rather than being silently omitted. Vite's native
`resolve.preserveSymlinks` option remains available when using Vite.

## Vite assets

A `vite.config.*` at the project root or `src/_client/main.{ts,js,tsx,jsx,css}`
automatically enables Vite. The private client entry is the default input when
Vite has no configured input. A sibling `main.css` is also built as a standalone
entry, so a layout can link it before JavaScript runs. Import other browser
assets from the client script.
Vite's hashed files and manifest are prepared and published alongside all routes.
`public/` is copied once by SSG. Production JSX can reference the manifest with
`Asset` and `assetUrl` from `@vincle/vite-plugin`.

```tsx
// src/_layout.tsx
import { Asset } from "@vincle/vite-plugin";

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <Asset entry="src/_client/main.ts" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`base` also sets Vite's `base`, in builds and in the development server, so
asset URLs carry the same prefix. A different `base` in the Vite configuration
is reported as a conflict. To override other Vite settings explicitly:

```ts
import { build } from "@vincle/ssg";
import { viteAssets } from "@vincle/ssg/vite";

await build({ base: "/docs/", assets: viteAssets({ build: { sourcemap: true } }) });
```

The page compiler shares Vite's production configuration, aliases and build-selected
plugins with the asset compiler. Pages and layouts reuse a single server module
graph for the build; it closes after publication or failure. A Vite configuration
with no browser entry still supplies page compilation without generating client
JavaScript. The fallback compiler retains the consumer's tsconfig path aliases.

For an existing asset build, `viteModules(config)` from `@vincle/ssg/vite` supplies
that same compiler without rebuilding assets. Pass its `modules` to
`discoverPages` and call `dispose()` when all pages have rendered.

`assets: false` disables automatic Vite integration; an explicit array (`[]` included)
declares the integrations instead. Assets accept one `AssetIntegration` or an array:
integrations are prepared in declaration order, each in its own preparation directory,
copied to the output root, wrapping the renderer first-declared-innermost, and disposed
in reverse order after publication. `dev()` prepares an integration once per session and
`watch` lists files whose modification rebuilds the site.

## Images

Declared descriptors in, generated files and `<Picture>` markup out. `@vincle/ssg/image`
encodes the widths and formats you list, publishes them with the pages and renders them
from the same descriptor, so markup and files cannot diverge.

```ts
assets: [viteAssets(), images({ converter, descriptors: [portrait] })];
```

`<Picture>` renders a declared descriptor; the converter (sharp, WASM, anything) stays
your code. Full page: [Images](https://vincle.cjean.fr/integration/ssg/images).

## Other runtimes and handlers

Vincle is the default JSX runtime. A runtime override supplies both its automatic
JSX import source and a renderer. The same choice compiles JSX, TSX, MDX and
layouts, including imported local components. A renderer must await the factory
because pages and layouts may be async.

```ts
await build({
  runtime: {
    importSource: "react",
    render: async (create) => renderToStaticMarkup(await create()),
  },
});
```

Install/import the alternate runtime and its server renderer in the consumer.
Vincle-specific components require the Vincle runtime.

Add or override a format with `handlers`; `false` disables a built-in extension.
Handlers receive source paths, their inferred route, `outputPath(extension)`, and
the runtime. They return metadata and a renderer that can emit multiple outputs.
For example, an optional Portable Text handler can use `@portabletext/to-html`:

```ts
import type { PageHandler } from "@vincle/ssg";

import { toHTML } from "@portabletext/to-html";
import { raw } from "@vincle/core";
import { readFile } from "node:fs/promises";

const portableText: PageHandler = {
  name: "portable-text",
  async load({ file }) {
    const article = JSON.parse(await readFile(file, "utf8"));
    return {
      meta: article.meta,
      render(context) {
        return {
          path: context.outputPath(),
          content: () => context.runtime.render(() => raw(toHTML(article.body))),
        };
      },
    };
  },
};
await build({ handlers: { ".pt": portableText } });
```

This example uses Vincle's `raw`; an integration targeting another runtime must
provide suitable nodes. Custom HTML renderers must escape dynamic values.

## Publication and advanced consumers

All output production, compilation and validation finish before replacing the
published files. Failed builds retain the previous pages **and Vite assets**.
Successful builds remove obsolete files. `preserve` protects top-level files or
directories owned by another tool. Publication uses filesystem moves and is not
atomic; concurrent builds to the same output directory are unsupported. Errors
are `SsgError` instances carrying `code: "ERR_VINCLE_SSG_BUILD"`, a stable
`reason`, a human-readable `message`, corrective `hint`, diagnostic `context`
(paths, plugin/handler and phase where relevant), and the original `cause`.
`JSON.stringify(error)` serializes the same diagnostic for loggers and LLM tools,
including bounded cause chains. Classify errors by `code` and `reason`, not by
matching their message text.

A missing source directory raises `SOURCE_MISSING`; a file used as a source root
raises `SOURCE_NOT_DIRECTORY`. Both abort before assets or output publication and
leave the previous site untouched. An existing empty directory is a valid input.
The lower-level `discoverPages` API also rejects missing source roots.

```ts
import { build, SsgError } from "@vincle/ssg";

try {
  await build();
} catch (error) {
  if (error instanceof SsgError) {
    console.error(error.message); // problem, context, corrective action
    console.error(JSON.stringify(error)); // structured diagnostic
  }
  throw error;
}
```

There is one handler API: `PageHandler.load(SourceContext)` returns metadata and
`render(PageContext)`, which produces one or more outputs. `build()` and
`discoverPages()` use this same contract; `renderPage()` exposes the same
metadata/render/transform lifecycle for specialized consumers.

Markdown and MDX use Sätteri by default. `createMdxHandler` from
`@vincle/ssg/mdx` configures that same pipeline for custom transforms. It defers compilation until rendering, caches compiled pages,
uses direct HTML for static Markdown, and emits the original source as a
Markdown alternate. Navigation, code highlighting, headings and the site shell
remain documentation features.
Each discovery reads a document once, so metadata, HTML and the Markdown
alternate use the same source snapshot. Edits are picked up by the next discovery.

```ts
import { build } from "@vincle/ssg";
import { createMdxHandler } from "@vincle/ssg/mdx";

await build({ handlers: { ".mdx": createMdxHandler() } });
```

`compile` accepts Sätteri's `MdxCompileOptions`, including a component provider.
`prepare({ file, meta })` returns per-document `data` and an optional
`createPlugins()` factory; `beforeRender(compiled, context)` receives that data
inside the render scope before layouts run. Static HTML shortcuts preserve
Core's link/image URL policy. Custom runtimes and component providers use the
compiled module path; a provider can explicitly enable the `RawHtml`/`html`
static optimization. Component overrides also load the compiled module lazily.

`MdxCache` is available from the same entry for custom producers; it separates
entries by source contents, module loader and JSX import source. It provides
`invalidate(file)` and `clear()` for explicit invalidation.

The default handler supports module metadata and additional `outputs` exports.
Modules with named exports are evaluated during discovery so metadata is
available to navigation and layouts; other documents compile when rendered.
`.md` files treat expressions, JSX and import/export statements as ordinary
Markdown. There is one compiler and no backend selection.

The lower-level `generateSite` writer remains available for existing output
pipelines. Its `beforePublish` callback exposes prepared `files`, `read(path)` and
`emit(output)` with the same collision/path checks. `SsgPlugin.publish` uses that
preparation stage, adding page contexts. Publication hooks may emit derived
artifacts such as a search index; these are not added to the built-in sitemap.

Migrating from `@vincle/site`: update the package dependency and imports to
`@vincle/ssg`. The lower-level writer's arguments remain unchanged.

## Development server

```ts
import { dev } from "@vincle/ssg";

const server = await dev({ vite: { server: { port: 4321 } } });
server.vite.printUrls();
// await server.close();
```

`dev` accepts the same source, handler, runtime, plugin and asset options as `build`.
An integration declaring `dev()` is prepared once per session and reused across
rebuilds; other integrations run `prepare` on every rebuild. A change to a `watch`
file rebuilds **every** page, not only the affected ones: declared asset files feed
the render chain, so no rendered page is reused. `viteAssets` serves source assets in
development instead of a client build, so the development server stays configured
through `dev.vite`.
It loads the project's Vite configuration, serves Vite's browser client and
assets, watches sources/imports/layouts/public files, and reloads the browser
after successful regeneration. Generated HTML passes through Vite's HTML
transforms. Generated JSON, text and binary files are served directly.

Page modules use the persistent SSR environment of the development Vite server,
with `serve` plugins and development configuration. Production generation retains
its separate `build` plugins, optimized assets and manifest. The source graph
invalidates modified modules and their importers; unchanged modules keep their
evaluations. MDX uses stable virtual module IDs in the same graph. Built-in
handlers reuse the rendered outputs and metadata of unaffected pages. Imports,
source files and layout candidates (including absent nearer layouts) determine
which pages must reload and render. Deleted routes drop their cached outputs. Vite serves source assets and handles their HMR. The generated
site lives in a temporary directory; `dist` is left intact. Rendering failures
keep the last successful output and display a Vite error overlay. `rebuild()`
allows explicit incremental regeneration; `rebuild({ force: true })` rerenders
all pages. `close()` stops watchers and removes temporary
output. Deleted pages release their compiled MDX, resolution and evaluation
caches; recreating a page at the same path loads its new content. Rebuild requests
received during an active build are coalesced into one pending regeneration,
instead of retaining a growing queue. Host, port, base and other development server settings belong in
`vite.config` or the `vite` option.

### Incremental dependencies and extensions

Declare direct filesystem reads with `context.watch(file)` in a handler,
producer, component or page plugin hook. Relative paths resolve beside the page
source, and missing paths are tracked so creating a file also invalidates its
pages. Module imports and inherited/explicit layouts are tracked automatically.

```ts
import type { PageContext } from "@vincle/ssg";

import { readFile } from "node:fs/promises";
import path from "node:path";

export default async (context: PageContext) => {
  const input = path.join(path.dirname(context.file), "_data.json");
  context.watch(input);
  return { path: context.outputPath(".json"), content: await readFile(input, "utf8") };
};
```

Use `meta.incremental: false` (or frontmatter `incremental: false`) for dynamic
producers depending on time, remote services or state that is not represented
by watched files. These pages run on every regeneration.

Custom handlers opt into caching with `incremental: true`. Custom plugins with
`metadata`, `render` or `transform` hooks trigger conservative full rendering
unless they declare `incremental: true`: their page hooks must be local to each
page, and filesystem dependencies must use `context.watch`. Vite restarts
invalidate the complete page cache. Changes received during rendering trigger a
follow-up regeneration; failed renders or publication hooks never commit a new
cache snapshot.

Publication hooks always run with all page contexts and all outputs, including
cached ones. The sitemap is regenerated from that complete set. Development
publication compares content hashes, stages and replaces only added or changed
files, and removes obsolete files and empty directories. Unchanged outputs keep
their inode and modification time, including copied resources and plugin outputs.
Copy sources are scanned for changes; their hashes are recalculated only when
source identity, size or timestamps change. Hooks can read both staged changes
and unchanged published outputs through `site.read`.

Collisions are checked against the complete site before changing published files.
Preparation and hook failures retain the last successful site. Filesystem failures
during publication can leave an incomplete site, as with a production build; the
next rebuild republishes everything. Source discovery, dependency checks, sitemap
calculation and global publication hooks still run across the complete site.
Production `build()` always runs every handler, renders every page and publishes
the complete site.

### Search and other page integrations

`plugin.publish(context)` receives `context.outputs`: the final generated HTML
pages, including unchanged pages reused in development. Each entry has `path`,
`url`, `meta` and an async `read()` that reads its HTML from the prepared site.
Content stays on disk until the plugin needs it. Use `meta.search: false` to opt a
page out; output-specific `meta` overrides the source metadata. The search engine
and HTML-to-text conversion belong to the plugin, not the SSG core.

```ts
const search = {
  name: "search",
  async publish(context: PublicationContext) {
    const documents = [];
    for (const page of context.outputs) {
      if (page.meta.search === false) continue;
      documents.push({
        url: page.url,
        title: page.meta.title,
        locale: page.meta.locale,
        html: await page.read(),
      });
    }
    await context.emit({ path: "search.json", content: JSON.stringify(documents) });
  },
};
```

Specialized sites can supply `discover(options, discover)` in their configuration.
Call the supplied `discover(options)` function, including any handler overrides,
to retain incremental loading and rendering in development. It returns
`DiscoveredPage[]` for filtering or enrichment; SSG still owns page hooks, assets,
sitemap and publication. Pages loaded independently remain conservatively rerendered.

For discovery-derived state such as a navigation catalog, assign a stable
`meta.renderKey` string to affected pages. Changing this key rerenders those pages
while unchanged keys allow cached HTML to be reused. Include every input that can
change their rendered output in the key, and use `context.watch()` for filesystem
dependencies. `meta.incremental: false` still disables reuse. Publication hooks
continue to receive the complete catalog and final HTML, including cached pages.

### Public URLs

`fullUrl(route, site)` resolves a route under the `site` URL from your SSG config,
including its deployment path. Without `site`, it returns the route unchanged.

```ts
import { fullUrl } from "@vincle/ssg";

import config from "./ssg.config.js";

fullUrl("/guide", config.site); // https://example.com/docs/guide
```

### Multilingual sitemap

```ts
export default defineConfig({
  site: "https://example.com/docs/",
  i18n: { locales: ["en", "fr"], defaultLocale: "en" },
});
// Each page exports metadata (or equivalent frontmatter):
export const meta = {
  title: "Bienvenue",
  locale: "fr",
  translationKey: "getting-started",
};
```

Pages sharing a `translationKey` form a translation group, independent of their
URL spelling. SSG emits reciprocal `xhtml:link` alternates for existing included
pages, including each page itself, and `x-default` when the default-language page
exists. Missing translations and pages excluded from the sitemap are not invented.
Duplicate key/language pairs fail before publication. Site base paths, XML escaping
and the sitemap size limits also apply to these links.

### Tailwind and development defaults

SSG automatically enables the project's installed `@tailwindcss/vite` plugin.
Install `tailwindcss` and `@tailwindcss/vite`, then import `tailwindcss` from your
client CSS. An explicitly configured Tailwind plugin is kept without duplication.
Vite and Tailwind scan the project's source files and optimize production CSS;
SSG publishes the hashed assets with the pages and removes obsolete assets only
after a successful build. Dynamically assembled class names still need Tailwind's
standard source declarations or complete class strings.

Development listens on `127.0.0.1`, with `Number(process.env.PORT ?? 4321)` as the
default port. Vite project settings and CLI `--host` / `--port` override these defaults.

SSG excludes private tooling directories (`.aws`, `.agents`, `.codex`), dependency
and Git directories, and generated output from dev watching. When native file
watching reaches the system limit (`ENOSPC`), SSG uses polling automatically,
including recovery after startup. Explicit polling options remain configurable
through `dev.vite.server.watch`; `watch: null` still disables watching.

The recommended structure separates `src/pages/` (routes), `src/_layout.tsx` (shared layout),
`src/components/`, `src/lib/`, `src/_client/` and `tests/`. Explicit `src` always
wins; an existing flat `src/` remains supported. Client entries are auto-detected
in `src/_client/main.{ts,js,tsx,jsx,css}`, with the route directory's `_client/`
retained as a fallback. Helpers beside `src/pages/` are never discovered as routes.

For `src/pages`, layout discovery reaches the shared `src/_layout.tsx`.
A closer layout in `src/pages` or a subsection overrides that shared layout.
