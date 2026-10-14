import { defineConfig } from "./src/lib/config.js";
import { MdxHandler } from "./src/lib/mdx.js";
import { site } from "./src/lib/site.js";

export default defineConfig({
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",

  ...site,
  // No `image` until a 1200×630 visual exists: a favicon as `og:image` would
  // make the card promise `summary_large_image`.

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
