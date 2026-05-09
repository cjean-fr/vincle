import { describe, expect, it } from "bun:test";

import { injectHeadingAnchors } from "./heading-anchors.js";
import { eachHeading, withoutAnchor } from "./headings.js";
import { injectToc, TOC_PLACEHOLDER } from "./toc.js";

const labels = (entries: { text: string }[]): string[] => entries.map((e) => e.text);

/** `injectToc` takes the render as a parameter: give it a spy. */
function tocLabels(html: string): string[] {
  let seen: string[] = [];
  injectToc(html, (entries) => {
    seen = labels(entries);
    return "";
  });
  return seen;
}

describe("eachHeading", () => {
  it("sees headings regardless of their content", () => {
    const html = `
      <h2 id="a">Simple</h2>
      <h3 id="b">With <code>tag</code></h3>
      <h2 id="c">On
      two lines</h2>`;
    expect(eachHeading(html).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores a heading with no id", () => {
    expect(eachHeading(`<h2>No id</h2>`)).toEqual([]);
  });
});

describe("table of contents and permalinks", () => {
  const page = `<main>${TOC_PLACEHOLDER}<h2 id="a">Heading A</h2><h3 id="b">Sub B</h3><h4 id="c">Too deep</h4></main>`;

  it("the table of contents keeps h2 and h3", () => {
    expect(tocLabels(page)).toEqual(["Heading A", "Sub B"]);
  });

  it("permalinks go from h2 to h4", () => {
    const out = injectHeadingAnchors(page);
    expect([...out.matchAll(/docs-heading-anchor/g)]).toHaveLength(3);
  });

  /**
   * The two passes commute. It used to be the opposite: the permalink adds a
   * "#" inside the heading, which ended up in the table-of-contents label, and
   * only the order of the transform array prevented it — written down in a
   * comment.
   */
  it("the order of the two passes changes nothing", () => {
    expect(tocLabels(injectHeadingAnchors(page))).toEqual(tocLabels(page));
  });

  it("a heading spanning several lines is seen by both", () => {
    // The latent divergence: `(.*?)` without the `s` flag on the
    // table-of-contents side, vs `([\s\S]*?)` on the permalinks side.
    const multi = `<main>${TOC_PLACEHOLDER}<h2 id="a">On\ntwo lines</h2></main>`;
    expect(tocLabels(multi)).toHaveLength(1);
    expect(injectHeadingAnchors(multi)).toContain("docs-heading-anchor");
  });
});

describe("withoutAnchor", () => {
  it("removes the permalink and nothing else", () => {
    const inner = `Heading<a class="docs-heading-anchor" href="#x" aria-label="l">#</a>`;
    expect(withoutAnchor(inner)).toBe("Heading");
    expect(withoutAnchor("Heading <em>clean</em>")).toBe("Heading <em>clean</em>");
  });
});
