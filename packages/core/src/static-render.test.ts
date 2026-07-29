import { describe, expect, test } from "bun:test";

import { VNode } from "./jsx-runtime.js";
import { RawString } from "./raw.js";
import { tryRenderStatic, NOT_STATIC } from "./static-render.js";

/**
 * hasDynamic était un flag module-level. tryRenderStatic le mettait à false,
 * foldChildren/foldChild le passaient à true sur un VNode.
 * Problème : ré-entrance via un getter dans les props → l'appel imbriqué
 * réinitialisait le flag de l'appel externe.
 *
 * Le fix remplace le flag partagé par un objet FoldState alloué par appel.
 * L'objet est passé par référence, foldChild reste monomorphe.
 */
/**
 * Scénario de ré-entrance : un getter dans les props est appelé PENDANT
 * la prop check de tryRenderStatic. Si le getter appelle tryRenderStatic
 * (via jsx, pour une string tag), l'ancien flag module-level hasDynamic
 * était réinitialisé par l'appel imbriqué, rendant l'appel externe
 * aveugle à la dynamique de l'interne.
 *
 * Avec le fix (FoldState par appel), chaque invocation a son propre état.
 */
describe("FoldState re-entrancy", () => {
  test("getter appelle tryRenderStatic statique → fold externe pas affecté", () => {
    // Le getter déclenche un tryRenderStatic interne pour un arbre
    // purement statique. L'interne a son propre FoldState, le flag
    // de l'externe n'est pas réinitialisé.
    const props = {
      get ["data-x"]() {
        // tryRenderStatic interne, arbre statique
        const inner = tryRenderStatic("span", { children: "inner" });
        expect(inner).toBeInstanceOf(RawString);
        return "x";
      },
      children: "hello",
    };

    const result = tryRenderStatic("div", props);
    expect(result).toBeInstanceOf(RawString);
  });

  test("getter appelle tryRenderStatic avec VNode → fold externe pas affecté", () => {
    // Le getter déclenche un tryRenderStatic interne avec un VNode
    // (donc NOT_STATIC). Sans le fix, hasDynamic passait à true dans
    // l'interne et LE RESTAIT après le retour, faisant croire à tort
    // à l'externe que son propre fold est dynamique.
    const props = {
      get ["data-x"]() {
        const inner = tryRenderStatic("div", { children: new VNode("span", {}, null) });
        expect(inner).toBe(NOT_STATIC);
        return "x";
      },
      children: "hello",
    };

    const result = tryRenderStatic("div", props);
    // L'externe : children "hello" statiques, getter retourne "x" statique
    // → le fold doit réussir et retourner RawString
    expect(result).toBeInstanceOf(RawString);
  });

  test("static tree", () => {
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("dynamic tree (VNode child)", () => {
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBe(NOT_STATIC);
  });
});

/**
 * Tag validation is not the tree walk's private business.
 *
 * The fold used to call `serializeElement(tag, …)` without ever checking the
 * name, so a static subtree under a caller-supplied tag went out as raw HTML
 * while the exact same tree on the VNode path threw. That gap was a way around
 * the check, not a mere inconsistency: a name carrying a space or a quote closes
 * the start tag, and everything after it becomes markup.
 */
describe("tag validation — the fold is held to the same rule as the tree walk", () => {
  const INVALID = [
    "div onload=alert(1)",
    'div"',
    "div>",
    "div<script",
    "div/",
    "div=",
    "",
    "!doctype",
    "?xml",
    "div ",
  ];

  for (const tag of INVALID) {
    test(`rejects ${JSON.stringify(tag)} instead of folding it`, () => {
      expect(() => tryRenderStatic(tag, { children: "hello" })).toThrow(
        /\[vincle\/core\] Invalid tag name/,
      );
    });
  }

  test("the rejection quotes the offending tag verbatim", () => {
    expect(() => tryRenderStatic("div onload=x", {})).toThrow('Invalid tag name "div onload=x"');
  });

  test("legitimate names still fold", () => {
    for (const tag of ["div", "my-element", "svg:rect", "h1", "data-x"]) {
      expect(tryRenderStatic(tag, { children: "ok" })).toBeInstanceOf(RawString);
    }
  });
});

describe("sequential calls isolation", () => {
  test("dynamic puis static", () => {
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBe(NOT_STATIC);
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("static puis dynamic", () => {
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBe(NOT_STATIC);
  });
});
