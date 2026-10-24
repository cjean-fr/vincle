import { describe, expect, it } from "bun:test";

import { searchShortcutInitScriptSource } from "../src/components/SearchDialog.js";

/** Run the head script against a stubbed browser and return the attribute it set. */
function flagFor(opts: {
  keyboard: boolean;
  platform?: string;
  uaPlatform?: string;
  throws?: boolean;
}) {
  const attrs: Record<string, string> = {};
  const env = {
    matchMedia: (query: string) => {
      if (opts.throws) throw new Error("unsupported");
      expect(query).toBe("(hover: hover) and (pointer: fine)");
      return { matches: opts.keyboard };
    },
    navigator: {
      platform: opts.platform ?? "",
      userAgentData: opts.uaPlatform ? { platform: opts.uaPlatform } : undefined,
    },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
  };
  new Function("matchMedia", "navigator", "document", searchShortcutInitScriptSource)(
    env.matchMedia,
    env.navigator,
    env.document,
  );
  return attrs["data-docs-shortcut"];
}

describe("search shortcut head script", () => {
  it("flags Apple platforms as mac", () => {
    expect(flagFor({ keyboard: true, platform: "MacIntel" })).toBe("mac");
    expect(flagFor({ keyboard: true, uaPlatform: "macOS" })).toBe("mac");
    expect(flagFor({ keyboard: true, platform: "iPad" })).toBe("mac");
  });

  it("flags other platforms as other", () => {
    expect(flagFor({ keyboard: true, platform: "Win32" })).toBe("other");
    expect(flagFor({ keyboard: true, platform: "Linux x86_64" })).toBe("other");
  });

  it("prefers the user agent data platform over navigator.platform", () => {
    expect(flagFor({ keyboard: true, platform: "Win32", uaPlatform: "macOS" })).toBe("mac");
  });

  it("claims nothing on touch-first devices", () => {
    expect(flagFor({ keyboard: false, platform: "iPhone" })).toBeUndefined();
  });

  it("claims nothing when the browser throws", () => {
    expect(flagFor({ keyboard: true, throws: true })).toBeUndefined();
  });
});
