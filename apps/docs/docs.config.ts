import { defineConfig } from "./src/lib/config.js";
import { MdxHandler } from "./src/lib/mdx.js";

export default defineConfig({
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",

  // No `image`: every page gets its own 1200×630 card (src/lib/social-card.ts).

  tabs: [
    { label: "Guide", slug: "guide" },
    { label: "Integration", slug: "integration" },
    { label: "API", slug: "api" },
  ],

  editUrl: "https://github.com/cjean-fr/vincle/edit/main/apps/docs",

  handlers: {
    ".mdx": MdxHandler,
  },
});
