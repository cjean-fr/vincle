import { renderToString } from "@vincle/core";
import { expect, test, spyOn } from "bun:test";

import { Icon, getIcon } from "../src/components/Icon.js";
import { iconNames, isIconName } from "../src/lib/icons.js";

test("all supported Tabler icons render locally with decorative semantics", async () => {
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  try {
    for (const name of iconNames) {
      const html = await renderToString(<Icon name={name} size={16} />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('width="16"');
      expect(html).toContain('height="16"');
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
  expect(isIconName("tabler:search")).toBe(true);
  expect(isIconName("tabler:missing")).toBe(false);
  await expect(Reflect.apply(getIcon, undefined, ["tabler:missing"])).rejects.toThrow(
    "Unknown local icon",
  );
});
