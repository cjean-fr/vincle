import { expect, it } from "bun:test";

import config from "../docs.config.js";
import { llmsFullTxt } from "../src/lib/publication.js";
import ssg from "../ssg.config.js";

it("keeps the llms-full.txt format", async () => {
  const pages = [
    { url: "/first", title: 'First "page"', text: "First & body." },
    { url: "/second", title: "Second", text: "Second body." },
  ];
  expect(await llmsFullTxt(pages, config)).toBe(
    [
      `# ${config.title}: Full documentation`,
      "",
      `> ${config.description}`,
      "",
      "---",
      `# ${pages[0]!.title}`,
      `Source: ${ssg.site ?? ""}/first`,
      "",
      "First & body.",
      "",
      "---",
      "# Second",
      `Source: ${ssg.site ?? ""}/second`,
      "",
      "Second body.",
      "",
    ].join("\n"),
  );
});
