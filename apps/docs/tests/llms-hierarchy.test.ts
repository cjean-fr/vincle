import { it, expect } from "bun:test";

import { llmsTxt } from "../src/lib/publication.js";

const config = {
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",
} as never;

it("groups llms.txt entries under their sidebar trail, in editorial order", () => {
  const out = llmsTxt(
    [
      { url: "/api/core/raw", title: "raw()", trail: ["API", "Core"], order: 2_000_000 },
      { url: "/", title: "Home", trail: [] },
      { url: "/guide/views", title: "Views", trail: ["Guide"], order: 5 },
      {
        url: "/guide/getting-started/installation",
        title: "Installation",
        trail: ["Guide", "Getting started"],
        order: 1,
      },
    ],
    config,
  );
  expect(out).toContain("## Guide / Getting started\n\n- [Installation]");
  expect(out).toContain("## Guide\n\n- [Views]");
  expect(out).toContain("## API / Core\n\n- [raw()]");
  // Editorial order: Guide sections, then API, uncategorized "Pages" last,
  // regardless of the input (URL) order.
  expect(out.indexOf("## Guide / Getting started")).toBeLessThan(out.indexOf("## Guide\n"));
  expect(out.indexOf("## Guide\n")).toBeLessThan(out.indexOf("## API"));
  expect(out.indexOf("## API")).toBeLessThan(out.indexOf("## Pages"));
});

it("keeps the flat Pages section when no trail is known", () => {
  const out = llmsTxt([{ url: "/a", title: "A" }], config);
  expect(out).toContain("## Pages\n\n- [A]");
});
