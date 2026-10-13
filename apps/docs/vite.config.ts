import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import satteri from "vite-plugin-satteri";

import { expressiveCodeAssets } from "./docs-src/lib/vite-expressive-code.js";

export default defineConfig({
  plugins: [
    expressiveCodeAssets(),
    // Pages and assets share this configuration. Documentation owns its MDX
    // compilation so it can keep highlighting, headings and publication lazy;
    // compiled page modules then use Vite for imports and JSX dependencies.
    satteri({
      mdx: {
        jsxImportSource: "@vincle/core",
        providerImportSource: pathToFileURL(path.resolve("docs-src/mdx-components.tsx")).href,
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
    rolldownOptions: {
      input: "docs-src/client.ts",
      output: {
        entryFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
