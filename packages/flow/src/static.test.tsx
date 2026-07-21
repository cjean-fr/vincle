import { describe, it, expect } from "bun:test";

import { TurboAdapter, NativeAdapter, EsiAdapter } from "./adapters/index.js";
import { renderToStatic, Template } from "./index.js";

describe("renderToStatic", () => {
  it("works without options for pure-static rendering", async () => {
    const result = await renderToStatic(async (ctx) => {
      const html = await ctx.renderPage(() => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ));
      return { html, count: ctx.templateStore.size };
    });
    expect(result.html).toContain("<p>hi</p>");
    expect(result.count).toBe(0);
    // pure-static (no fragments) → no adapter, no polyfill
    expect(result.html).not.toContain("<script>");
  });

  it("collects fragments without flushing them", async () => {
    const AsyncContent = async () => <span>real</span>;
    const result = await renderToStatic(
      async (ctx) => {
        const html = await ctx.renderPage(() => (
          <html>
            <body>
              <Template target="content"><AsyncContent /></Template>
            </body>
          </html>
        ));
        return {
          html,
          ids: ctx.templateStore.outstanding(new Set()).map(([id]) => id),
        };
      },
      { adapter: TurboAdapter },
    );
    expect(result.html).toContain('id="content"');
    expect(result.html).not.toContain("turbo-stream");
    expect(result.ids).toEqual(["content"]);
  });

  it("applies adapter.transformShell — polyfill injected when fragments exist", async () => {
    const AsyncContent = async () => <span>x</span>;
    const result = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <head></head>
            <body>
              <Template target="x"><AsyncContent /></Template>
            </body>
          </html>
        )),
      { adapter: NativeAdapter },
    );
    expect(result).toContain("MutationObserver");
  });

  describe("ctx.emitFragments", () => {
    it("wraps each fragment in adapter.Frame and hands it to the callback", async () => {
      const written: Array<{ id: string; url: string; html: string }> = [];
      await renderToStatic(
        async (ctx) => {
          await ctx.renderPage(() => (
            <html>
              <body>
                <Template target="content"><span>real</span></Template>
              </body>
            </html>
          ));
          await ctx.emitFragments((id, url, html) => void written.push({ id, url, html }));
        },
        { adapter: TurboAdapter },
      );
      expect(written).toHaveLength(1);
      expect(written[0]!.id).toBe("content");
      expect(written[0]!.url).toBe("/fragments/content.html");
      expect(written[0]!.html).toContain("<turbo-frame");
      expect(written[0]!.html).toContain("<span>real</span>");
    });

    it("uses a custom generatePath", async () => {
      const urls: string[] = [];
      await renderToStatic(
        async (ctx) => {
          await ctx.renderPage(() => (
            <html>
              <body>
                <Template target="content"><span>real</span></Template>
              </body>
            </html>
          ));
          await ctx.emitFragments((_id, url) => void urls.push(url));
        },
        { adapter: TurboAdapter, generatePath: (id) => `/f/${id}.html` },
      );
      expect(urls).toEqual(["/f/content.html"]);
    });

    it("throws a clear error when <Template> is used without an adapter", async () => {
      const AsyncContent = async () => <span>x</span>;
      const result = renderToStatic(async (ctx: any) => {
        await ctx.renderPage(() => (
          <html>
            <body>
              <Template target="x"><AsyncContent /></Template>
            </body>
          </html>
        ));
        await ctx.emitFragments(() => {});
      });
      await expect(result).rejects.toThrow("Template requires an adapter");
    });

    it("wraps each fragment in adapter.Frame when adapter is configured", async () => {
      const written: Array<{ id: string; html: string }> = [];
      await renderToStatic(
        async (ctx) => {
          await ctx.renderPage(() => (
            <html>
              <body>
                <Template target="content"><span>real</span></Template>
              </body>
            </html>
          ));
          await ctx.emitFragments((id, _url, html) => void written.push({ id, html }));
        },
        { adapter: NativeAdapter },
      );
      expect(written).toHaveLength(1);
      expect(written[0]!.id).toBe("content");
      expect(written[0]!.html).toContain('<template for="content">');
      expect(written[0]!.html).toContain("<span>real</span>");
    });
  });

  it("ESI: placeholders become esi:include, fragments materialize as-is", async () => {
    const files: Record<string, string> = {};
    const AsyncContent = async () => <span>real</span>;
    await renderToStatic(
      async (ctx) => {
        const page = await ctx.renderPage(() => (
          <html>
            <body>
              <Template target="content"><AsyncContent /></Template>
            </body>
          </html>
        ));
        files["index"] = page;
        await ctx.emitFragments((_id, url, html) => void (files[url] = html));
      },
      { adapter: EsiAdapter, generatePath: (id) => `/esi/${id}.html` },
    );
    expect(files["index"]).toContain("esi:include");
    expect(files["index"]).toContain('src="/esi/content.html"');
    expect(files["/esi/content.html"]).toContain("<span>real</span>");
  });

  describe("SSG stress — concurrency (regression: initFlowAssets race)", () => {
    const PAGE_COUNT = 50;

    it("renders many pages concurrently without cross-contamination", async () => {
      const pages = await Promise.all(
        Array.from({ length: PAGE_COUNT }, (_, i) =>
          renderToStatic(async (ctx) =>
            ctx.renderPage(() => (
              <html>
                <body>
                  <p>page-{i}</p>
                </body>
              </html>
            )),
          ),
        ),
      );

      expect(pages).toHaveLength(PAGE_COUNT);
      for (let i = 0; i < PAGE_COUNT; i++) {
        expect(pages[i]).toContain(`<p>page-${i}</p>`);
        for (let j = 0; j < PAGE_COUNT; j++) {
          if (j !== i) {
            expect(pages[i]).not.toContain(`<p>page-${j}</p>`);
          }
        }
      }
    });

    it("renders many pages with fragments concurrently", async () => {
      const pages = await Promise.all(
        Array.from({ length: PAGE_COUNT }, (_, i) =>
          renderToStatic(
            async (ctx) => {
              const AsyncContent = async () => <span>frag-{i}</span>;
              const html = await ctx.renderPage(() => (
                <html>
                  <body>
                    <p>page-{i}</p>
                    <Template target={`frag-${i}`}><AsyncContent /></Template>
                  </body>
                </html>
              ));
              return { html, ids: ctx.templateStore.outstanding(new Set()).map(([id]) => id) };
            },
            { adapter: TurboAdapter },
          ),
        ),
      );

      expect(pages).toHaveLength(PAGE_COUNT);
      for (let i = 0; i < PAGE_COUNT; i++) {
        const page = pages[i]!;
        expect(page.html).toContain(`<p>page-${i}</p>`);
        expect(page.ids).toEqual([`frag-${i}`]);
      }
    });

    it("handles mixed load with and without fragments, high concurrency", async () => {
      const [purePages, fragmentPages]: [
        Array<{ html: string; ids: string[] }>,
        Array<{ html: string; ids: string[] }>,
      ] = await Promise.all([
        Promise.all(
          Array.from({ length: PAGE_COUNT / 2 }, (_, k) => {
            const i = k * 2;
            return renderToStatic(async (ctx) => {
              const html = await ctx.renderPage(() => (
                <html>
                  <body>
                    <p>page-{i}</p>
                  </body>
                </html>
              ));
              return { html, ids: ctx.templateStore.outstanding(new Set()).map(([id]) => id) };
            });
          }),
        ),
        Promise.all(
          Array.from({ length: PAGE_COUNT / 2 }, (_, k) => {
            const i = k * 2 + 1;
            return renderToStatic(
              async (ctx) => {
                const AsyncContent = async () => <span>odd-{i}</span>;
                const html = await ctx.renderPage(() => (
                  <html>
                    <body>
                      <p>page-{i}</p>
                      <Template target={`t-${i}`}><AsyncContent /></Template>
                    </body>
                  </html>
                ));
                return {
                  html,
                  ids: ctx.templateStore.outstanding(new Set()).map(([id]) => id),
                };
              },
              { adapter: TurboAdapter },
            );
          }),
        ),
      ]);

      for (let k = 0; k < PAGE_COUNT / 2; k++) {
        const pure = purePages[k]!;
        const frag = fragmentPages[k]!;
        const iEven = k * 2;
        const iOdd = k * 2 + 1;
        expect(pure.html).toContain(`<p>page-${iEven}</p>`);
        expect(pure.ids).toHaveLength(0);
        expect(frag.html).toContain(`<p>page-${iOdd}</p>`);
        expect(frag.ids).toEqual([`t-${iOdd}`]);
      }
    });
  });

  it("<Template> with async content uses NativeAdapter when explicitly passed", async () => {
    const AsyncContent = async () => <span>real</span>;
    const html = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <head></head>
            <body>
              <Template target="content"><AsyncContent /></Template>
            </body>
          </html>
        )),
      { adapter: NativeAdapter },
    );
    expect(html).toContain('<?start name="content">'); // Native placeholder marker
    expect(html).toContain("MutationObserver"); // polyfill injected — a fragment exists
  });
});
