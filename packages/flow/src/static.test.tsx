import { describe, it, expect } from "bun:test";

import { TurboAdapter, NativeAdapter, EsiAdapter } from "./adapters/index.js";
import { renderToStatic, Defer } from "./index.js";

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
      return { html, count: ctx.pendingStore.size };
    });
    expect(result.html).toContain("<p>hi</p>");
    expect(result.count).toBe(0);
    // pure-static (no fragments) → no adapter, no polyfill
    expect(result.html).not.toContain("<script>");
  });

  it("collects fragments without flushing them", async () => {
    const result = await renderToStatic(
      async (ctx) => {
        const html = await ctx.renderPage(() => (
          <html>
            <body>
              <Defer>{() => <span>real</span>}</Defer>
            </body>
          </html>
        ));
        return {
          html,
          ids: ctx.pendingStore.pending(new Set()).map(([id]) => id),
        };
      },
      { adapter: TurboAdapter },
    );
    expect(result.html).toContain('id="fragment-1"');
    expect(result.html).not.toContain("turbo-stream");
    expect(result.ids).toEqual(["fragment-1"]);
  });

  it("applies adapter.transformShell — polyfill injected when fragments exist", async () => {
    const result = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <head></head>
            <body>
              <Defer>{() => <span>x</span>}</Defer>
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
                <Defer>{() => <span>real</span>}</Defer>
              </body>
            </html>
          ));
          await ctx.emitFragments((id, url, html) => void written.push({ id, url, html }));
        },
        { adapter: TurboAdapter },
      );
      expect(written).toHaveLength(1);
      expect(written[0]!.id).toBe("fragment-1");
      expect(written[0]!.url).toBe("/fragments/fragment-1.html");
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
                <Defer>{() => <span>real</span>}</Defer>
              </body>
            </html>
          ));
          await ctx.emitFragments((_id, url) => void urls.push(url));
        },
        { adapter: TurboAdapter, generatePath: (id) => `/f/${id}.html` },
      );
      expect(urls).toEqual(["/f/fragment-1.html"]);
    });

    it("throws a clear error when <Defer> is used without an adapter", async () => {
      const result = renderToStatic(async (ctx: any) => {
        await ctx.renderPage(() => (
          <html>
            <body>
              <Defer>{() => <span>x</span>}</Defer>
            </body>
          </html>
        ));
        await ctx.emitFragments(() => {});
      });
      await expect(result).rejects.toThrow("Defer requires an adapter");
    });

    it("wraps each fragment in adapter.Frame when adapter is configured", async () => {
      const written: Array<{ id: string; html: string }> = [];
      await renderToStatic(
        async (ctx) => {
          await ctx.renderPage(() => (
            <html>
              <body>
                <Defer>{() => <span>real</span>}</Defer>
              </body>
            </html>
          ));
          await ctx.emitFragments((id, _url, html) => void written.push({ id, html }));
        },
        { adapter: NativeAdapter },
      );
      expect(written).toHaveLength(1);
      expect(written[0]!.id).toBe("fragment-1");
      expect(written[0]!.html).toContain('<template for="fragment-1">');
      expect(written[0]!.html).toContain("<span>real</span>");
    });
  });

  it("ESI: placeholders become esi:include, fragments materialize as-is", async () => {
    const files: Record<string, string> = {};
    await renderToStatic(
      async (ctx) => {
        const page = await ctx.renderPage(() => (
          <html>
            <body>
              <Defer>{() => <span>real</span>}</Defer>
            </body>
          </html>
        ));
        files["index"] = page;
        await ctx.emitFragments((_id, url, html) => void (files[url] = html));
      },
      { adapter: EsiAdapter, generatePath: (id) => `/esi/${id}.html` },
    );
    expect(files["index"]).toContain("esi:include");
    expect(files["index"]).toContain('src="/esi/fragment-1.html"');
    expect(files["/esi/fragment-1.html"]).toContain("<span>real</span>");
  });

  it("<Defer> with content uses NativeAdapter when explicitly passed", async () => {
    const html = await renderToStatic(
      async (ctx) =>
        ctx.renderPage(() => (
          <html>
            <head></head>
            <body>
              <Defer>{() => <span>real</span>}</Defer>
            </body>
          </html>
        )),
      { adapter: NativeAdapter },
    );
    expect(html).toContain('<?start name="fragment-1">'); // Native placeholder marker
    expect(html).toContain("MutationObserver"); // polyfill injected — a fragment exists
  });
});
