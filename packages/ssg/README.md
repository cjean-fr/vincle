# @vincle/ssg

Static generation from a project's file hierarchy. Use conventions first:

```ts
import { build } from "@vincle/ssg";

await build();
```

The project root is the current directory. Routes live in `src/`, outputs go to
`dist/`, and `public/` is copied to the output root. No configuration is needed
for JavaScript, TypeScript, JSX, TSX, Markdown or MDX. Private files/directories
starting with `_` or `.` and test/declaration files are not routes; use these for
shared components, layouts and helpers. Symbolic source entries are ignored.

| Source                  | Route            | Default output                                           |
| ----------------------- | ---------------- | -------------------------------------------------------- |
| `src/index.tsx`         | `/`              | `dist/index.html`                                        |
| `src/about.jsx`         | `/about`         | `dist/about/index.html`                                  |
| `src/guide/index.md`    | `/guide`         | `dist/guide/index.html`, `dist/guide.md`                 |
| `src/guide/article.mdx` | `/guide/article` | `dist/guide/article/index.html`, `dist/guide/article.md` |
| `src/data.json.ts`      | `/data.json`     | `dist/data.json` when returning text or bytes            |
| `src/robots.txt.js`     | `/robots.txt`    | `dist/robots.txt` when returning text or bytes           |

HTML uses directory indexes. Markdown alternates retain the exact source,
including MDX syntax. There is no browser runtime or hydration added by SSG.

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
file path. Site URLs may include a deployment prefix; included paths are resolved
under it. `build({ sitemap: false })` disables sitemap generation globally.

## Vite assets

A `vite.config.*` at the project root or `src/_client/main.{ts,js,tsx,jsx,css}`
automatically enables Vite. The private client entry is the default input when
Vite has no configured input; import CSS, images and other browser assets there.
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

To override Vite settings explicitly:

```ts
import { build } from "@vincle/ssg";
import { viteAssets } from "@vincle/ssg/vite";

await build({ assets: viteAssets({ base: "/docs/" }) });
```

The page compiler shares Vite's production configuration, aliases and build-selected
plugins with the asset compiler. Pages and layouts reuse a single server module
graph for the build; it closes after publication or failure. A Vite configuration
with no browser entry still supplies page compilation without generating client
JavaScript. The fallback compiler retains the consumer's tsconfig path aliases.

For an existing asset build, `viteModules(config)` from `@vincle/ssg/vite` supplies
that same compiler without rebuilding assets. Pass its `modules` to
`discoverPages` and call `dispose()` when all pages have rendered.

`assets: false` disables automatic Vite integration. Other bundlers can implement
`AssetIntegration`. This is a production build API; development servers remain
owned by the consumer.

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
metadata/render/transform lifecycle for specialized consumers. The old generic
handler and `SsgHandler` name are removed.

The documentation uses a custom `PageHandler` for its specialized Markdown
compiler, plus the shared Vite module loader and `renderPage` lifecycle. Its
handler emits HTML and Markdown together. Navigation, publication dates and the
site shell remain documentation features.

The lower-level `generateSite` writer remains available for existing output
pipelines. Its `beforePublish` callback exposes prepared `files`, `read(path)` and
`emit(output)` with the same collision/path checks. `SsgPlugin.publish` uses that
preparation stage, adding page contexts. Publication hooks may emit derived
artifacts such as a search index; these are not added to the built-in sitemap.

Migrating from `@vincle/site`: update the package dependency and imports to
`@vincle/ssg`. The lower-level writer's arguments remain unchanged. This repository
contains the renamed package; renaming does not publish it to npm.

## Development server

```ts
import { dev } from "@vincle/ssg";

const server = await dev({ vite: { server: { port: 4321 } } });
server.vite.printUrls();
// await server.close();
```

`dev` accepts the same source, handler, runtime and SSG plugin options as `build`.
Asset generation integrations belong to `build`; dev uses Vite source assets.
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
