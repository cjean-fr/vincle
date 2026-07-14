import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { Flow, initFlow } from "../context.js";
import { Fill } from "../index.js";

describe("Fill", () => {
  it("registers content without rendering a placeholder", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Fill target="toast-list" merge="append">
          {() => <li>Notification</li>}
        </Fill>,
      );
      expect(html).toBe("");
      const entries = useContext(Flow).pendingStore.pending(new Set());
      expect(entries.find(([id]) => id === "toast-list")?.[1].merge).toBe("append");
    });
  });
});
