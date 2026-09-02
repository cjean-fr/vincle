import type { VNode } from "@vincle/core";

import { raw, renderToString, withScope } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter, NativeAdapter } from "../adapters/index.js";
import { initFlow } from "../context.js";
import { renderToStatic, Template, Slot } from "../index.js";
import { renderToStream } from "../render.js";
import { collect } from "../test-utils.js";

describe("Template — deferred content (placeholder always)", () => {
  it("renders a placeholder, then patches in sync content with the given merge", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="toast-list" merge="append">
                <li>Notification</li>
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="toast-list">');
    expect(html).toContain('action="append"');
    expect(html).toContain('target="toast-list"');
    expect(html).toContain("Notification");
  });

  it("renders a placeholder for async component content, then patches it in once it resolves", async () => {
    const AsyncContent = async () => <span>content</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="content">
                <AsyncContent />
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="content">');
    expect(html).toContain('target="content"');
    expect(html).toContain("content");
  });

  it("accepts a promise returning a node, and patches it in once it resolves", async () => {
    const AsyncContent = async () => <span>inline</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="inline">
                <AsyncContent />
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="inline">');
    expect(html).toContain("inline");
  });

  it("honours an explicit target", async () => {
    const AsyncContent = async () => <span>x</span>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="cart">
                <AsyncContent />
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="cart">');
    expect(html).toContain('target="cart"');
  });

  it("stores an explicit merge type", async () => {
    const AsyncContent = async () => <li>item</li>;
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="list" merge="append">
                <AsyncContent />
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('action="append"');
    expect(html).toContain('target="list"');
  });

  it("registers plain JSX content and renders a placeholder", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="plain">
                <span>plain</span>
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('<turbo-frame id="plain">');
    expect(html).toContain("plain");
  });

  it("generates a src in static mode", async () => {
    await withScope(async () => {
      initFlow({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      const AsyncContent = async () => <span>content</span>;
      const html = await renderToString(
        <Template target="content">
          <AsyncContent />
        </Template>,
      );
      expect(html).toContain('src="/f/content.html"');
    });
  });
});

describe("Template — streaming sequences (async-iterable child)", () => {
  it("streams each yield as an append fragment", async () => {
    async function* rows() {
      yield (<li>a</li>) as VNode;
      yield (<li>b</li>) as VNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Template target="feed" merge="append">
                {rows()}
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
    expect((html.match(/target="feed"/g) ?? []).length).toBe(2);
    expect(html).toContain('action="append"');
  });

  it("streams even with no other template content present", async () => {
    async function* rows() {
      yield (<li>only</li>) as VNode;
    }
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <ul id="feed" />
              <Template target="feed" merge="append">
                {rows()}
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("<li>only</li>");
    expect(html).toContain("</html>");
  });

  it("a streaming Template registered inside a one-shot async Template is picked up", async () => {
    async function* inner() {
      yield (<li>streamed</li>) as VNode;
    }
    const Outer = () => (
      <div>
        deferred
        <Template target="feed" merge="append">
          {inner()}
        </Template>
      </div>
    );
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Template target="deferred">
                <Outer />
              </Template>
            </body>
          </html>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain("streamed");
    expect(html).toContain("deferred");
  });
});

describe("edge cases — Template", () => {
  it("NativeAdapter escapes a hostile id in the processing instruction", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <body>
              <Slot name={'x"><script>alert(1)</script>'} />
            </body>
          </html>
        ),
        NativeAdapter,
      ),
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script>");
  });
});

describe("a string TemplateContent is text, not markup", () => {
  // The JSDoc said "raw HTML (stored verbatim, rendered later)" and the code
  // escapes — so the safe thing happened while the documented use case, passing
  // pre-rendered HTML from a cache or a CMS, silently rendered as visible
  // characters. Both halves are pinned here so the doc and the code cannot
  // drift apart again.
  const emit = async (content: unknown) => {
    let body = "";
    await renderToStatic(
      async (ctx) => {
        await ctx.renderPage(() => (
          <html>
            <body>
              <Template target="t">{content as never}</Template>
            </body>
          </html>
        ));
        await ctx.emitFragments((_id, _url, html) => void (body = html));
      },
      { adapter: TurboAdapter },
    );
    return body;
  };

  it("escapes a plain string", async () => {
    expect(await emit("<b>hi</b>")).toBe('<turbo-frame id="t">&lt;b&gt;hi&lt;/b&gt;</turbo-frame>');
  });

  it("passes it through when wrapped in raw()", async () => {
    expect(await emit(raw("<b>hi</b>"))).toBe('<turbo-frame id="t"><b>hi</b></turbo-frame>');
  });
});
