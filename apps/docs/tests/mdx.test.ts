import type { ModuleLoader } from "@vincle/ssg";

import { raw, renderToString } from "@vincle/core";
import { discoverPages } from "@vincle/ssg";
import { MdxCache } from "@vincle/ssg/mdx";
import { beforeAll, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { htmlToHast } from "satteri";

import { docsMdxOptions } from "../src/lib/mdx.js";

const PAGES_DIR = path.resolve(import.meta.dirname, "../src/pages");

const APP_DIR = path.resolve(import.meta.dirname, "..");

function freshCache() {
  return new MdxCache(docsMdxOptions);
}

/** SSG's own module loader, counting the modules MDX actually imports. */
let imports = 0;
let modules: ModuleLoader;
beforeAll(async () => {
  const [page] = await discoverPages({ src: path.join(PAGES_DIR, "guide/getting-started") });
  const loader = page!.source.modules;
  modules = { load: (...args) => (imports++, loader.load(...args)) };
});

/** Inside the app, so compiled MDX resolves @vincle/core from its node_modules. */
const fixtureDirectory = (prefix: string) => mkdtemp(path.join(APP_DIR, `.${prefix}-`));

it("renders static Markdown without importing a module, preserving component overrides", async () => {
  const directory = await fixtureDirectory("mdx-static-test");
  const file = path.join(directory, "page.mdx");
  try {
    await writeFile(file, "---\ntitle: Static page\n---\n# Static heading\n\nA paragraph.\n");
    const before = imports;
    const { Component } = await freshCache().load(file, modules);
    expect(await renderToString(Component({}))).toContain(
      '<h1 id="static-heading">Static heading</h1>',
    );
    expect(imports).toBe(before);
    expect(
      await renderToString(Component({ components: { RawHtml: () => raw("override") } })),
    ).toBe("override");
    expect(imports).toBe(before + 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps highlighted code and Markdown URLs static, but loads executable MDX", async () => {
  const directory = await fixtureDirectory("mdx-runtime-test");
  try {
    const file = path.join(directory, "page.mdx");
    await writeFile(
      file,
      [
        "---",
        "title: Code page",
        "---",
        "# Code",
        "",
        "[link](javascript:alert%281%29) ![image](javascript:foo)",
        "",
        "```tsx",
        'import { renderToString } from "@vincle/core";',
        'const html = await renderToString(<h1>{"Hello"}</h1>);',
        "```",
        "",
      ].join("\n"),
    );
    const before = imports;
    const { Component } = await freshCache().load(file, modules);
    const html = await renderToString(Component({}));
    expect(html).toContain('class="docs-code-block"');
    expect(html).toContain("<button");
    expect(html).toContain("var(--shiki-token-");
    expect(html).toContain('href="#blocked"');
    expect(html).toContain('src="#blocked"');
    expect(html).not.toContain('href="javascript:');
    expect(imports).toBe(before);
    await writeFile(
      file,
      '---\ntitle: Runtime page\n---\nimport { raw } from "@vincle/core"\n\n{raw("<p>Executed</p>")}\n',
    );
    const runtime = await freshCache().load(file, modules);
    expect(await renderToString(runtime.Component({}))).toContain("<p>Executed</p>");
    expect(imports).toBe(before + 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("colors JSX/TSX without changing the source copied from the code element", async () => {
  const directory = await fixtureDirectory("mdx-jsx-test");
  const source = [
    'import { Button } from "./button";',
    'const label = "a & b < c";',
    "const view = <><Button disabled={false} {...props}>{label}</Button><input /></>;",
  ].join("\n");
  function text(node: ReturnType<typeof htmlToHast>): string {
    if (node.type === "text") return node.value;
    return "children" in node ? node.children.map(text).join("") : "";
  }
  try {
    for (const language of ["jsx", "tsx"]) {
      const file = path.join(directory, `${language}.mdx`);
      await writeFile(
        file,
        `# Example\n\n\`\`\`${language} title="component.${language}"\n${source}\n\`\`\``,
      );
      const { Component } = await freshCache().load(file, modules);
      const html = await renderToString(Component({}));
      const tree = htmlToHast(html, { fragment: true });
      if (tree.type !== "root") throw new Error("Expected an HTML fragment");
      const figure = tree.children.find(
        (node) => node.type === "element" && node.tagName === "figure",
      );
      const pre =
        figure?.type === "element"
          ? figure.children.find((node) => node.type === "element" && node.tagName === "pre")
          : undefined;
      const code =
        pre?.type === "element"
          ? pre.children.find((node) => node.type === "element" && node.tagName === "code")
          : undefined;
      expect(code).toBeDefined();
      expect(text(code!)).toBe(source + "\n");
      expect(html).toContain("var(--shiki-token-");
      expect(html).toContain(`component.${language}`);
      expect(html).toContain("data-docs-copy");
      expect(html).not.toContain("<Button");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("draws mermaid fences with unique ids, one copy of each stylesheet and no font import", async () => {
  const directory = await fixtureDirectory("mdx-mermaid-test");
  try {
    const file = path.join(directory, "page.mdx");
    const sequence = "```mermaid\nsequenceDiagram\n  A->>B: one\n```\n\n";
    await writeFile(
      file,
      [
        "---",
        "title: Diagrams",
        "---",
        sequence,
        sequence,
        "```mermaid\nerDiagram\n  A ||--o{ B : has\n```\n",
      ].join("\n"),
    );
    const { Component } = await freshCache().load(file, modules);
    const html = await renderToString(Component({}));
    expect(html.match(/<svg\b/g)).toHaveLength(3);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const references = [...html.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(ids).toContain(reference);
    // The two sequence diagrams share a stylesheet; the ER diagram needs its own.
    expect(html.match(/<style>/g)).toHaveLength(2);
    expect(html).not.toContain("googleapis");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
