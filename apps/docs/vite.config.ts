import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import satteri from "vite-plugin-satteri";

import { expressiveCodeAssets } from "./docs-src/lib/vite-expressive-code.js";

export default defineConfig({
  plugins: [
    expressiveCodeAssets(),
    // No `precompile()` here on purpose: this Vite build produces the client
    // bundle, whose entry graph is `.ts` and CSS — no JSX passes through it. The
    // pages are rendered by the SSG, which imports the compiled MDX directly and
    // never goes through Vite. And precompile pays per render repeated: a page
    // built once has nothing to amortise.
    satteri({
      mdx: {
        jsxImportSource: "@vincle/core",
        providerImportSource: pathToFileURL(path.resolve("docs-src/mdx-components.jsx")).href,
      },
    }),
    tailwindcss(),
  ],
  appType: "custom",
  publicDir: "public",
  build: {
    outDir: "dist/assets",
    assetsDir: "",
    manifest: true,
    rollupOptions: {
      input: "docs-src/client.ts",
      output: {
        entryFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
