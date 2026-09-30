import { describe, expect, it } from "bun:test";

import { prepareNativeTemplates } from "./native-shell.js";

// Native must own its templates even when the browser implements only part of WICG.
describe("native template preparation", () => {
  it("protects target attributes while preserving values and unrelated markup", () => {
    const html =
      '<label for="field">Label</label><template data-note="a > b" FOR="nav" src="/nav.html"></template>';
    expect(prepareNativeTemplates(html)).toEqual({
      html: '<label for="field">Label</label><template data-note="a > b" data-FOR="nav" src="/nav.html"></template>',
      active: true,
    });
  });

  it("detects src-only and empty-for includes and stays idempotent", () => {
    for (const html of ['<template src="/nav.html"></template>', '<template for=""></template>']) {
      const prepared = prepareNativeTemplates(html);
      expect(prepared.active).toBe(true);
      expect(prepareNativeTemplates(prepared.html)).toEqual(prepared);
    }
  });

  it("keeps inert templates free of runtime requirements", () => {
    expect(
      prepareNativeTemplates('<template><template for="nav" src="/nav.html"></template></template>')
        .active,
    ).toBe(false);
    expect(prepareNativeTemplates("<template><p>Saved content</p></template>").active).toBe(false);
  });

  it("ignores template text in comments, attributes, scripts, styles and textareas", () => {
    for (const html of [
      '<!-- <template for="nav" src="/nav.html"> -->',
      '<div data-note="<template for=nav src=/nav.html>"></div>',
      '<script>const text = "<template for=nav src=/nav.html>";</script>',
      '<script>const text = "</scripture><template for=nav src=/nav.html>";</script>',
      '<style>p::after { content: "<template for=nav>" }</style>',
      '<textarea><template for="nav" src="/nav.html"></textarea>',
    ]) {
      expect(prepareNativeTemplates(html)).toEqual({ html, active: false });
    }
  });
});
