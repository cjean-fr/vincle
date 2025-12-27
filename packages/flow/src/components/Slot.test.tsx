import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { Slot } from "../index.js";
import { renderToStream } from "../render.js";
import { collect } from "../test-utils.js";

describe("Slot", () => {
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
});
