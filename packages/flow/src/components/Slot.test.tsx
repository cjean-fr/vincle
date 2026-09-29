import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { Defer, Slot, renderToStatic } from "../index.js";
import { renderToStream } from "../render.js";
import { collect } from "../test-utils.js";

describe("Slot", () => {
  it("settles markers inside a retained Defer fallback", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <>
            <Defer target="outer" fallback={<Defer target="inner">inner result</Defer>}>
              outer result
            </Defer>
            <Slot name="inner">
              <span>inner loading</span>
            </Slot>
          </>
        ),
        TurboAdapter,
      ),
    );
    expect(html).not.toContain("vincle-defer");
    expect(html.match(/<turbo-frame id="inner"/g)).toHaveLength(1);
    expect(html).toContain('id="outer"');
    expect(html).toContain("inner result");
    expect(html).toContain("outer result");
  });
  it("renders a placeholder with no registration when children are absent", async () => {
    const html = await collect(renderToStream(() => <Slot name="sidebar" />, TurboAdapter));
    expect(html).toContain('id="sidebar"');
    // "No registration" means no patch ever gets drained for it.
    expect(html).not.toContain("<turbo-stream");
  });

  it("renders children as placeholder content with no registration", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <Slot name="main">
            <span>content</span>
          </Slot>
        ),
        TurboAdapter,
      ),
    );
    expect(html).toContain('id="main"');
    expect(html).toContain("<span>content</span>");
    expect(html).not.toContain("<turbo-stream");
  });

  it("is the only placeholder of the Defer that fills it", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <main>
            <Slot name="cart">
              <span>Loading…</span>
            </Slot>
            <Defer target="cart">{async () => <p>3 items</p>}</Defer>
          </main>
        ),
        TurboAdapter,
      ),
    );
    expect(html.match(/<turbo-frame id="cart"/g)).toHaveLength(1);
    expect(html).toContain("<p>3 items</p>");
  });

  it("fills a Slot that comes after its Defer", async () => {
    const html = await collect(
      renderToStream(
        () => (
          <main>
            <Defer target="cart">{async () => <p>3 items</p>}</Defer>
            <Slot name="cart">
              <span>Loading…</span>
            </Slot>
          </main>
        ),
        TurboAdapter,
      ),
    );
    expect(html.match(/<turbo-frame id="cart"/g)).toHaveLength(1);
    expect(html).toContain("<span>Loading…</span>");
    expect(html).not.toContain("vincle-defer");
  });

  it("leaves a targeted Defer with no Slot its own placeholder, unmarked", async () => {
    const html = await collect(
      renderToStream(() => <Defer target="cart">{async () => <p>3 items</p>}</Defer>, TurboAdapter),
    );
    expect(html.match(/<turbo-frame id="cart"/g)).toHaveLength(1);
    expect(html).not.toContain("vincle-defer");
  });

  it("knows the Slots of its own page only", async () => {
    const pages = await renderToStatic(
      async (ctx) => [
        await ctx.renderPage(() => (
          <Slot name="cart">
            <span>Loading…</span>
          </Slot>
        )),
        await ctx.renderPage(() => <Defer target="cart">{async () => <p>3 items</p>}</Defer>),
      ],
      { adapter: TurboAdapter },
    );
    expect(pages[1]).toContain('<turbo-frame id="cart"');
  });
});
