# @vincle/vite-plugin

Vite asset integration for [@vincle/core](../core) projects. Reference your assets by their **source path** (`src/main.ts`, `src/styles/main.css`, `src/logo.svg`) and let one component (or one helper for arbitrary tags) resolve them correctly in both dev and production.

## Why

A @vincle/core + Vite project typically hardcodes asset paths in its layout:

```tsx
<link rel="stylesheet" href="/assets/main.css" />
<script type="module" src="/assets/main.js"></script>
```

Three problems:

- **Dev/prod drift** — Vite serves sources directly in dev (`/src/styles/main.css`), bundles them with hashes in build (`/assets/main-Bx7k.css`). Most projects work around this with string replaces.
- **No cache-busting** — to keep the hardcoded paths working, you turn off Vite's content hashing.
- **No transitive preloading** — production bundles split chunks but the layout doesn't see those splits.

This package solves all three with one component.

## Install

```bash
bun add @vincle/vite-plugin
```

## Usage

### 1. Reference assets in your layout

```tsx
import { Asset } from "@vincle/vite-plugin";

export function Layout({ children }) {
  return (
    <html>
      <head>
        <title>My app</title>
        <Asset entry="src/main.ts" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

The `entry` is the **source path** as Vite sees it. The same string works in both modes.

### 2. Configure the scope before rendering

Once per render, call `setVite()`:

```ts
import { setVite, loadViteManifest } from "@vincle/vite-plugin";

// Production build: load the manifest produced by `vite build`
const manifest = await loadViteManifest("dist/.vite/manifest.json");
setVite(manifest, { base: "/" });

// Dev mode: pass null
setVite(null);
```

`loadViteManifest` returns `null` if the file is absent — same behavior dev setups rely on, so you can write:

```ts
const manifest = await loadViteManifest("dist/.vite/manifest.json");
setVite(manifest); // null in dev, real manifest in prod
```

### 3. Reference arbitrary assets with `assetUrl()`

For tags `<Asset>` doesn't emit (images, fonts, favicons, OpenGraph metadata, …), use `assetUrl(entry)` inside the attribute you build yourself:

```tsx
import { assetUrl } from "@vincle/vite-plugin";

<link rel="icon" href={assetUrl("src/favicon.svg")} />
<link
  rel="preload"
  as="font"
  type="font/woff2"
  href={assetUrl("src/fonts/inter.woff2")}
  crossorigin
/>
<img src={assetUrl("src/hero.png")} alt="hero" />
<meta property="og:image" content={assetUrl("src/og-image.png")} />
```

Resolution rules:

- Dev: returns `{base}{entry}` (Vite serves the source directly).
- Prod: returns `{base}{chunk.file}` from the manifest.
- Throws if the entry is missing from the manifest in prod.

### 4. What `<Asset>` emits

**Dev mode** (`manifest === null`):

```tsx
<Asset entry="src/styles/main.css" />
// → <link rel="stylesheet" href="/src/styles/main.css">

<Asset entry="src/main.ts" />
// → <script type="module" src="/src/main.ts">
```

The Vite HMR client (`/@vite/client`) is **not** emitted here — pipe your output through `server.transformIndexHtml()` to let Vite inject it (and apply its other dev-mode transforms). Any setup that bypasses `transformIndexHtml` must add `<script type="module" src="/@vite/client">` manually.

**Production mode** (manifest provided):

```tsx
<Asset entry="src/main.ts" />
// → <link rel="stylesheet" href="/assets/main-Bx7k2c.css">     ← co-bundled CSS
//   <link rel="modulepreload" href="/assets/shared-xyz789.js"> ← transitive imports
//   <script type="module" src="/assets/main-abc123.js">        ← entry itself
```

CSS-only entries:

```tsx
<Asset entry="src/styles/main.css" />
// → <link rel="stylesheet" href="/assets/main-only-d4f6.css">
```

If the entry is not in the manifest, `<Asset>` throws a clear error listing the available entries — typos surface immediately.

## Vite configuration

For `loadViteManifest` to find a manifest, enable it in `vite.config.ts`:

```ts
export default defineConfig({
  build: {
    manifest: true,
    rollupOptions: {
      input: "src/main.ts",
    },
  },
});
```

The manifest will be written to `<outDir>/.vite/manifest.json`.

## API

| Export                         | Description                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Asset`                        | Component that resolves an entry to `<link>` / `<script>` / `<link rel="modulepreload">` tags (CSS / JS only) |
| `assetUrl(entry)`              | Function that resolves an entry to a URL string — use inside arbitrary tags (images, fonts, favicons, …)      |
| `setVite(manifest, { base? })` | Configure the render scope. Call once per render.                                                             |
| `loadViteManifest(path)`       | Load a Vite manifest from disk. Returns `null` if the file does not exist.                                    |
| `ViteManifest`                 | Type mirroring Vite's `manifest.json` shape                                                                   |
| `ViteManifestChunk`            | Type for a single manifest entry                                                                              |

## Notes

- `setVite()` uses `setContext()` from @vincle/core — it must be called inside a `withScope()` (renderToString, renderToStatic, renderToReadableStream all establish one).
- `loadViteManifest()` uses `node:fs/promises` — works in Node ≥ 20, Bun, and Deno.
- The package has no dependency on `vite` itself — only on `@vincle/core`.

## License

MIT © Christophe Jean
