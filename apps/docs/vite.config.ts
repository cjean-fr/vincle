import tailwindcss from "@tailwindcss/vite";
import precompile from "@vincle/vite-plugin-precompile";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import satteri from "vite-plugin-satteri";

import { expressiveCodeAssets } from "./docs-src/lib/vite-expressive-code.js";

export default defineConfig({
  plugins: [
    expressiveCodeAssets(),
    precompile(),
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
