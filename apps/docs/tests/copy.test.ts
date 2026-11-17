import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { messages, t } from "../src/lib/messages.js";

function setup(writeText: (text: string) => Promise<void>) {
  const handlers: Record<string, () => Promise<void>> = {};
  const attributes: Record<string, string> = {};
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const tooltip = { textContent: "" };
  const block = { textContent: "code" };
  const button = {
    hidden: true,
    title: t("copyCode"),
    dataset: {} as Record<string, string>,
    parentElement: { querySelector: () => tooltip },
    closest: () => ({ querySelector: () => block }),
    getAttribute: (key: string) => (key === "aria-label" ? t("copyCode") : null),
    setAttribute: (key: string, value: string) => {
      attributes[key] = value;
    },
    removeAttribute: (key: string) => {
      delete attributes[key];
    },
    toggleAttribute: (key: string, force: boolean) => {
      if (force) attributes[key] = "";
      else delete attributes[key];
    },
    addEventListener: (_name: string, handler: () => Promise<void>) => {
      handlers["click"] = handler;
    },
  };
  const context = {
    document: { querySelectorAll: () => [button] },
    navigator: { clipboard: { writeText } },
    setTimeout: (callback: () => void, _delay: number) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
  };
  const client = readFileSync(
    new URL("../src/_client/highlight/client.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/, "");
  runInNewContext(
    `const messages = ${JSON.stringify(messages)};\nconst t = ${t.toString()};\n${new Bun.Transpiler({ loader: "ts" }).transformSync(client)}`,
    context,
  );
  return {
    attributes,
    tooltip,
    timers,
    click: () => handlers["click"]!(),
    settleTimers: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
  };
}

test("copies the block, confirms, then resets", async () => {
  let written = "";
  const page = setup(async (text) => {
    written = text;
  });
  await page.click();
  expect(written).toBe("code");
  expect(page.attributes["data-copied"]).toBe("");
  expect(page.attributes["aria-label"]).toBe(t("copiedCode"));
  expect(page.tooltip.textContent).toBe(t("copiedCode"));
  page.settleTimers();
  expect(page.attributes["data-copied"]).toBeUndefined();
  expect(page.attributes["aria-label"]).toBe(t("copyCode"));
  expect(page.tooltip.textContent).toBe("");
});

test("a second click while the write is in flight starts no second write", async () => {
  let writes = 0;
  let release!: () => void;
  const page = setup(
    () =>
      new Promise<void>((resolve) => {
        writes++;
        release = resolve;
      }),
  );
  const first = page.click();
  const second = page.click();
  release();
  await Promise.all([first, second]);
  expect(writes).toBe(1);
  expect(page.attributes["data-copied"]).toBe("");
});

test("a failed write shows Copy failed and the next click retries", async () => {
  let fail = true;
  const page = setup(async () => {
    if (fail) throw new Error("denied");
  });
  await page.click();
  expect(page.attributes["data-copied"]).toBeUndefined();
  expect(page.attributes["data-failed"]).toBe("");
  expect(page.attributes["aria-label"]).toBe(t("copyFailed"));
  expect(page.tooltip.textContent).toBe(t("copyFailed"));
  fail = false;
  await page.click();
  expect(page.attributes["data-failed"]).toBeUndefined();
  expect(page.attributes["data-copied"]).toBe("");
});

test("a click after feedback starts a fresh write and replaces the reset timer", async () => {
  const page = setup(async () => {});
  await page.click();
  const firstTimer = page.timers.size;
  await page.click();
  expect(firstTimer).toBe(1);
  expect(page.timers.size).toBe(1);
});
