import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { Flow, initFlow } from "../context.js";
import { Slot } from "../index.js";

describe("Slot", () => {
  it("renders a placeholder with no registration when children are absent", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<Slot name="sidebar" />);
      expect(html).toContain('id="sidebar"');
      expect(useContext(Flow).templateStore.size).toBe(0);
    });
  });

  it("renders children as placeholder content with no registration", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Slot name="main">
          <span>content</span>
        </Slot>,
      );
      expect(html).toContain('id="main"');
      expect(html).toContain("<span>content</span>");
      const { templateStore } = useContext(Flow);
      expect(templateStore.size).toBe(0);
    });
  });
});
