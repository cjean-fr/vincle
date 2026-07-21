import { describe, it, expect } from "bun:test";

import { NativeAdapter } from "./adapters/index.js";
import { Style, Script } from "./components/index.js";
import { renderToStream, renderToStatic, Template } from "./index.js";
import { collect } from "./test-utils.js";

describe("Style/Script — render pipeline integration", () => {
  it("deduplicates same name across shell", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Style name="base">{"body { color: red }"}</Style>
            </head>
            <body>
              <Style name="base">{"body { color: red }"}</Style>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    // Only one style tag (first occurrence in head)
    const matches = html.match(/<style data-name="base">/g);
    expect(matches).toHaveLength(1);
    // It should be in the head
    expect(html.indexOf("<head>")).toBeLessThan(html.indexOf('<style data-name="base">'));
  });

  it("only evaluates factory once for duplicate names", async () => {
    let count = 0;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Style name="ec/base">
                {async () => {
                  count++;
                  return "body { color: red }";
                }}
              </Style>
              <Style name="ec/base">
                {async () => {
                  count++;
                  return "body { color: blue }";
                }}
              </Style>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    expect(count).toBe(1);
    expect(html).toContain("color: red");
    expect(html).not.toContain("color: blue");
  });

  it("different names resolved independently", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Style name="a">{" .a { }"}</Style>
              <Style name="b">{" .b { }"}</Style>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    expect(html).toContain('<style data-name="a">');
    expect(html).toContain('<style data-name="b">');
  });

  it("resolves Script with module attribute", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Script name="init" module>
                {"console.log('hi')"}
              </Script>
            </head>
            <body>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    expect(html).toContain('<script data-name="init" type="module">');
  });

  it("resolves Script with defer", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Script name="late" defer>
                {"console.log('deferred')"}
              </Script>
            </head>
            <body>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    expect(html).toContain('<script data-name="late" defer>');
  });

  it("resolves Script with src", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Script name="jquery" src="/vendor/jquery.js" />
            </head>
            <body>
              <p>hi</p>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    expect(html).toContain('<script data-name="jquery" src="/vendor/jquery.js"></script>');
  });

  it("deduplicates name across fragments: emitted in shell → removed from fragment", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head>
              <Style name="shared">{"body { color: red }"}</Style>
            </head>
            <body>
              <Template target="frag1">
                <div>
                  <Style name="shared">{"body { color: red }"}</Style>
                  <span>from fragment</span>
                </div>
              </Template>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    // Only one style tag (from shell)
    expect(html.match(/<style data-name="shared">/g)).toHaveLength(1);
    // The fragment should not contain the style marker
    const fragMatch = html.match(/vincle:style:shared/g);
    expect(fragMatch).toBeNull();
  });

  it("resolves new name in fragment not seen in shell", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head></head>
            <body>
              <Template target="frag1">
                <div>
                  <Style name="inline">{" .inline { }"}</Style>
                  <span>from fragment</span>
                </div>
              </Template>
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );

    // The fragment should contain the resolved style tag
    expect(html).toContain('<style data-name="inline">');
  });
});

describe("Style/Script — SSG (renderToStatic)", () => {
  it("each page gets its own assets (page boundary)", async () => {
    const pages: string[] = [];
    await renderToStatic(async (ctx) => {
      const page1 = await ctx.renderPage(() => (
        <html>
          <body>
            <Style name="page1-style">{" .p1 { }"}</Style>
            <span>page1</span>
          </body>
        </html>
      ));
      pages.push(page1);

      const page2 = await ctx.renderPage(() => (
        <html>
          <body>
            <Style name="page2-style">{" .p2 { }"}</Style>
            <span>page2</span>
          </body>
        </html>
      ));
      pages.push(page2);
    });

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('<style data-name="page1-style">');
    expect(pages[0]).not.toContain("page2-style");
    expect(pages[1]).toContain('<style data-name="page2-style">');
    expect(pages[1]).not.toContain("page1-style");
  });

  it("same name in different pages: each page resolves its own", async () => {
    const pages: string[] = [];
    await renderToStatic(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        const html = await ctx.renderPage(() => (
          <html>
            <body>
              <Style name="shared">{" .shared { color: red }"}</Style>
              <span>page {i}</span>
            </body>
          </html>
        ));
        pages.push(html);
      }
    });

    // Each page gets the style tag
    expect(pages[0]!.match(/<style data-name="shared">/g)).toHaveLength(1);
    expect(pages[1]!.match(/<style data-name="shared">/g)).toHaveLength(1);
  });

  it("parallel renderPage calls get isolated asset state (no cross-contamination)", async () => {
    // Regression: initFlowAssets used to mutate the shared Flow context object,
    // so two Promise.all'd renders raced on one `.assets`. Each page must keep
    // its own style; page1 losing its style (or gaining page2's) means the race
    // is back.
    const [page1, page2] = await renderToStatic(async (ctx) =>
      Promise.all([
        ctx.renderPage(() => (
          <html>
            <body>
              <Style name="p1">{".p1{}"}</Style>
              <span>1</span>
            </body>
          </html>
        )),
        ctx.renderPage(() => (
          <html>
            <body>
              <Style name="p2">{".p2{}"}</Style>
              <span>2</span>
            </body>
          </html>
        )),
      ]),
    );

    expect(page1).toContain('data-name="p1"');
    expect(page1).not.toContain('data-name="p2"');
    expect(page2).toContain('data-name="p2"');
    expect(page2).not.toContain('data-name="p1"');
  });
});
