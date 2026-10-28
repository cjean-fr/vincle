import { it, expect } from "bun:test";

import { llmsTxt } from "../src/lib/publication.js";

const config = {
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",
} as never;

it("groups llms.txt entries under their sidebar trail", () => {
  const out = llmsTxt(
    [
      { url: "/", title: "Home", trail: [] },
      { url: "/guide/views", title: "Views", trail: ["Guide"] },
      {
        url: "/guide/getting-started/installation",
        title: "Installation",
        trail: ["Guide", "Getting started"],
      },
    ],
    config,
  );
  expect(out).toContain("## Pages\n\n- [Home]");
  expect(out).toContain("## Guide\n\n- [Views]");
  expect(out).toContain("## Guide / Getting started\n\n- [Installation]");
  // Sections appear in order of first appearance.
  expect(out.indexOf("## Pages")).toBeLessThan(out.indexOf("## Guide"));
});

it("keeps the flat Pages section when no trail is known", () => {
  const out = llmsTxt([{ url: "/a", title: "A" }], config);
  expect(out).toContain("## Pages\n\n- [A]");
});
