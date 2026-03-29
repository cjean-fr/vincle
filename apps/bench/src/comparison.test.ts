/**
 * The behavioural claims of `/guide/comparison`, executable.
 *
 * These are other people's libraries: their answers move on upgrade. A failure
 * here means the page is stale, not that anything is broken.
 */
import { createElement as kita } from "@kitajs/html";
import { renderToString } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";
import { describe, expect, it } from "bun:test";
import { jsx as honoJsx } from "hono/jsx";
import { h } from "preact";
import { render as preactRender, renderToStringAsync } from "preact-render-to-string";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const EVIL = `<img src=x onerror="alert(1)">`;
const escaped = (html: string): boolean => !html.includes("<img");

describe("escaping a text child — comparison page, first table", () => {
  it("@vincle/core escapes", async () => {
    expect(escaped(await renderToString(jsx("div", { children: EVIL })))).toBe(true);
  });

  it("react, preact and hono escape", () => {
    expect(escaped(renderToStaticMarkup(createElement("div", null, EVIL)))).toBe(true);
    expect(escaped(preactRender(h("div", null, EVIL)))).toBe(true);
    // Children as trailing args: `{ children }` silently renders an empty element.
    expect(escaped(String(honoJsx("div", {}, EVIL)))).toBe(true);
  });

  it("@kitajs/html does not, and does when asked", () => {
    // Their documented design, backed by ts-html-plugin — pinned, not judged.
    expect(escaped(String(kita("div", null, EVIL)))).toBe(false);
    expect(escaped(String(kita("div", { safe: true }, EVIL)))).toBe(true);
  });
});

describe("a component returning a promise — comparison page, feature table", () => {
  const Async = () => Promise.resolve("hello");

  it("@vincle/core and @kitajs/html render it", async () => {
    expect(await renderToString(jsx("div", { children: jsx(Async, {}) }))).toBe("<div>hello</div>");
    expect(String(await kita("div", null, kita(Async, null)))).toBe("<div>hello</div>");
  });

  it("preact drops it silently, sync and async alike", async () => {
    // No error, no warning, just missing content.
    expect(preactRender(h("div", null, h(Async as never, null)))).toBe("<div></div>");
    expect(await renderToStringAsync(h("div", null, h(Async as never, null)))).toBe("<div></div>");
  });

  it("hono/jsx and react-dom throw", () => {
    expect(() => String(honoJsx("div", {}, honoJsx(Async as never, {})))).toThrow();
    expect(() =>
      renderToStaticMarkup(createElement("div", null, createElement(Async as never, null))),
    ).toThrow();
  });
});
