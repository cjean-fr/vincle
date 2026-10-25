import { describe, expect, it } from "bun:test";

import { shortcutLabel } from "../src/_client/search-shortcut.js";

describe("search shortcut label", () => {
  it("uses the command key on Apple platforms", () => {
    expect(shortcutLabel("MacIntel", true)).toBe("⌘K");
    expect(shortcutLabel("macOS", true)).toBe("⌘K");
  });

  it("uses Ctrl on Windows and Linux", () => {
    expect(shortcutLabel("Win32", true)).toBe("Ctrl K");
    expect(shortcutLabel("Linux x86_64", true)).toBe("Ctrl K");
  });

  it("shows nothing without a keyboard", () => {
    expect(shortcutLabel("iPhone", false)).toBeNull();
    expect(shortcutLabel("Linux armv8l", false)).toBeNull();
  });
});
