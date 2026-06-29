import { defineConfig } from "./docs-src/config.js";
import { MdxHandler } from "./docs-src/handlers/mdx.js";

export default defineConfig({
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",

  site: "https://vincle.netlify.app",
  image: "https://vincle.netlify.app/favicon.svg",

  pages: "docs-src/pages",
  examples: "docs-src/examples",
  clientEntry: "docs-src/client.ts",
  out: "dist",
  base: "/assets/",
  viteManifest: "dist/assets/.vite/manifest.json",

  tabs: [
    { label: "Guide", slug: "guide" },
    { label: "Integration", slug: "integration" },
    { label: "API", slug: "api" },
  ],

  editUrl: "https://github.com/vincle/vincle/edit/main/apps/docs",

  handlers: {
    ".mdx": { handler: MdxHandler, prose: true },
  },
});
