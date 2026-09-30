import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { applyTheme } from "../docs-src/theme/state.js";

function setup(stored: string | null = null, dark = false, blocked = false) {
  const handlers: Record<string, (event: any) => void> = {};
  const attributes: Record<string, string> = {};
  const html = {
    dataset: {} as Record<string, string>,
    classList: {
      toggle(_name: string, value: boolean) {
        dark = value;
      },
    },
  };
  class Element {
    closest() {
      return this;
    }
  }
  const media = {
    matches: dark,
    addEventListener(_name: string, callback: (event: any) => void) {
      handlers.system = callback;
    },
  };
  const context = {
    Element,
    document: {
      documentElement: html,
      querySelectorAll: () => [
        { setAttribute: (key: string, value: string) => (attributes[key] = value) },
      ],
      addEventListener: (key: string, callback: any) => (handlers[key] = callback),
    },
    window: { addEventListener: (key: string, callback: any) => (handlers[key] = callback) },
    matchMedia: () => media,
    localStorage: {
      getItem() {
        if (blocked) throw Error();
        return stored;
      },
      setItem(_key: string, value: string) {
        if (blocked) throw Error();
        stored = value;
      },
      removeItem() {
        if (blocked) throw Error();
        stored = null;
      },
    },
  };
  const client = readFileSync(
    new URL("../docs-src/theme/client.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/, "");
  runInNewContext(
    `const applyTheme = ${applyTheme.toString()};\n${new Bun.Transpiler({ loader: "ts" }).transformSync(client)}`,
    context,
  );
  return {
    html,
    attributes,
    media,
    click: () => handlers.click!({ target: new Element() }),
    system: (value: boolean) => {
      media.matches = value;
      handlers.system!({});
    },
    dark: () => dark,
    stored: () => stored,
  };
}

for (const systemDark of [false, true]) {
  test(`toggles auto and the opposite of a ${systemDark ? "dark" : "light"} system theme`, () => {
    const page = setup(null, systemDark);
    const opposite = systemDark ? "light" : "dark";
    expect(page.html.dataset.theme).toBe("auto");
    expect(page.dark()).toBe(systemDark);
    expect(page.attributes["aria-label"]).toContain("Automatic");
    expect(page.attributes["title"]).toBe(page.attributes["aria-label"]);
    page.click();
    expect(page.html.dataset.theme).toBe(opposite);
    expect(page.dark()).toBe(!systemDark);
    expect(page.stored()).toBe(opposite);
    expect(page.attributes["aria-label"]).toContain("Return to Automatic");
    page.click();
    expect(page.html.dataset.theme).toBe("auto");
    expect(page.dark()).toBe(systemDark);
    expect(page.stored()).toBeNull();
    page.system(!systemDark);
    expect(page.dark()).toBe(!systemDark);
    expect(page.attributes["aria-label"]).toContain("Automatic");
  });

  test(`preserves a manual theme when the system changes from ${systemDark ? "dark" : "light"}`, () => {
    const page = setup(null, systemDark);
    page.click();
    page.system(!systemDark);
    expect(page.html.dataset.theme).toBe(systemDark ? "light" : "dark");
    expect(page.dark()).toBe(!systemDark);
    page.click();
    expect(page.html.dataset.theme).toBe(systemDark ? "dark" : "light");
    expect(page.dark()).toBe(systemDark);
    expect(page.stored()).toBe(systemDark ? "dark" : "light");
    page.click();
    expect(page.html.dataset.theme).toBe("auto");
    expect(page.stored()).toBeNull();
    expect(page.dark()).toBe(!systemDark);
  });
}

test("restores saved preference and still works without localStorage", () => {
  expect(setup("light", true).dark()).toBe(false);
  expect(setup("invalid", true).html.dataset.theme).toBe("auto");
  const page = setup(null, true, true);
  expect(page.dark()).toBe(true);
  page.click();
  expect(page.dark()).toBe(false);
});
