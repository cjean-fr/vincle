import path from "node:path";

import type { DocsConfig } from "./src/lib/types.js";

export default {
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",
  pages: path.resolve(import.meta.dirname, "src/pages"),
  tabs: [
    { label: "Guide", slug: "guide" },
    { label: "Integration", slug: "integration" },
    { label: "API", slug: "api" },
  ],
  editUrl: "https://github.com/cjean-fr/vincle/edit/main/apps/docs",
} satisfies DocsConfig;
