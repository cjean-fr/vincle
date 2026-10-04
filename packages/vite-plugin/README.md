# @vincle/vite-plugin

Resolve Vite assets by source path in `@vincle/core` layouts. Uses source URLs
in development and hashed manifest URLs in production, including bundled CSS
and module preload links.

## Install

```sh
bun add @vincle/core @vincle/vite-plugin
pnpm add @vincle/core @vincle/vite-plugin
npm install @vincle/core @vincle/vite-plugin
```

## Usage

Enable the manifest and declare your entry in Vite:

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    manifest: true,
    rollupOptions: { input: "src/main.ts" },
  },
});
```

Configure asset resolution once per render, inside a scope:

```tsx
import { Scope, renderToString } from "@vincle/core";
import { Asset, loadViteManifest, setVite } from "@vincle/vite-plugin";

const manifest = await loadViteManifest("dist/.vite/manifest.json");

const html = await Scope.with(() => {
  setVite(manifest);
  return renderToString(
    <html>
      <head>
        <Asset entry="src/main.ts" />
      </head>
      <body>Hello</body>
    </html>,
  );
});
```

`loadViteManifest` returns `null` when the file is absent (development).
`setVite(manifest, { base: "/app/" })` sets a custom URL prefix.
Use `assetUrl(entry)` for images, fonts and other asset URLs.

In development, pass the rendered HTML through Vite's `transformIndexHtml`
to inject the HMR client. Flow renderers already create a scope.

[Documentation](https://vincle.cjean.fr) ·
[Source and API](https://github.com/cjean-fr/vincle/blob/main/packages/vite-plugin/src/index.tsx)

MIT © Christophe Jean
