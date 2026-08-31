import { describe, it, expect } from "bun:test";

import { TurboAdapter, NativeAdapter } from "./adapters/index.js";
import { renderFragment } from "./fragment.js";

describe("renderFragment", () => {
  it("produces the same bytes emitFragments would for that id", async () => {
    const { url, html } = await renderFragment("price-AAPL", <span>182.30</span>, {
      adapter: TurboAdapter,
    });
    expect(url).toBe("/fragments/price-AAPL.html");
    expect(html).toContain("<turbo-frame");
    expect(html).toContain("<span>182.30</span>");
  });

  it("honors a custom generatePath", async () => {
    const { url } = await renderFragment("price-AAPL", <span>182.30</span>, {
      adapter: TurboAdapter,
      generatePath: (id) => `/f/${id}.html`,
    });
    expect(url).toBe("/f/price-AAPL.html");
  });

  it("accepts a lazy factory, same as <Template>", async () => {
    const { html } = await renderFragment("price-AAPL", () => <span>182.30</span>, {
      adapter: NativeAdapter,
    });
    expect(html).toContain('<template for="price-AAPL">');
    expect(html).toContain("<span>182.30</span>");
  });

  it("settles on the last yield for a streamed content", async () => {
    async function* prices() {
      yield <span>180.00</span>;
      yield <span>182.30</span>;
    }
    const { html } = await renderFragment("price-AAPL", prices(), { adapter: TurboAdapter });
    expect(html).toContain("<span>182.30</span>");
    expect(html).not.toContain("180.00");
  });

  it("throws when the id never resolves to a fragment", async () => {
    async function* empty() {}
    await expect(renderFragment("price-AAPL", empty(), { adapter: TurboAdapter })).rejects.toThrow(
      'renderFragment("price-AAPL"): produced no output for this id',
    );
  });
});
