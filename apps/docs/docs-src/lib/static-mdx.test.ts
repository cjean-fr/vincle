import { expect, it } from "bun:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mdxToJs } from "satteri";

import { staticMdxHtml } from "./static-mdx.js";

async function compile(source: string) {
  return (
    await mdxToJs(source, {
      jsxImportSource: "@vincle/core",
      providerImportSource: pathToFileURL(
        path.resolve(import.meta.dirname, "../mdx-components.jsx"),
      ).href,
      optimizeStatic: { component: "RawHtml", prop: "html" },
    })
  ).code;
}

it("recognizes the compiler's complete static module and decodes its HTML", async () => {
  const html = staticMdxHtml(await compile('# Heading\n\nQuotes " and backticks `code`.'));
  expect(html).toContain("<h1>Heading</h1>");
  expect(html).toContain("<code>code</code>");
});

it("falls back for expressions, imports and additional executable code", async () => {
  expect(staticMdxHtml(await compile("# Heading\n\n{1 + 2}"))).toBeNull();
  expect(
    staticMdxHtml(await compile('import { raw } from "@vincle/core"\n\n# Heading')),
  ).toBeNull();
  const code = await compile("# Heading");
  expect(staticMdxHtml(code + "\nconsole.log('side effect');")).toBeNull();
  expect(
    staticMdxHtml(
      code.replace(
        "return _jsx(RawHtml, { html: ",
        'return _jsx(RawHtml, { html: console.log("side effect"), other: ',
      ),
    ),
  ).toBeNull();
});
