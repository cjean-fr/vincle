import { Flow, initFlow } from "../context.js";
import { Slot } from "../index.js";
import { TurboAdapter } from "../adapters/index.js";
import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

describe("Slot", () => {
  it("renders a placeholder with no registration when children are absent", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<Slot name="sidebar" />);
      expect(html).toContain('id="sidebar"');
      expect(useContext(Flow).pendingStore.size).toBe(0);
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
      const { pendingStore } = useContext(Flow);
      expect(pendingStore.size).toBe(0);
    });
  });
});
