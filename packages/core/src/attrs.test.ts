import { describe, expect, test } from "bun:test";

import {
  ANIMATED_URL_ATTRIBUTES,
  ATTR_NAME_TABLES,
  URL_ATTRIBUTES,
  attrMeta,
  buildAttrs,
  isEventHandlerName,
  isValidAttrName,
  resolveAttrName,
  serializeAttr,
} from "./attrs.js";
import { valueToText } from "./escape.js";
import { jsx } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { isAnimationTag } from "./tag.js";
import { raw, rawUrl } from "./types.js";

// ── serializeAttr: the value taxonomy, pinned once ─────────────────────────
//
// The single dispatch every attribute path shares: `buildAttrs` keeps its own
// inline copy (delegation costs the static path 13–16%), and
// `jsxAttr` delegates directly. The values below are the contract: written by
// hand, not derived from another serializer, or the test would only prove a
// serializer equals itself.

describe("serializeAttr: the value taxonomy", () => {
  const CASES: [string, unknown, string | null][] = [
    // Handlers are plain attributes: emitted, not dropped.
    ["onClick", 'alert("x") & 1', 'onclick="alert(&quot;x&quot;) &amp; 1"'],
    ["onClick", 42, 'onclick="42"'],
    // Strings: the hot path, coercion-free.
    ["class", "foo", 'class="foo"'],
    ["className", "foo", 'class="foo"'],
    // URL attributes: unsafe scheme → #blocked.
    ["href", "javascript:alert(1)", 'href="#blocked"'],
    ["href", "java\tscript:alert(1)", 'href="#blocked"'],
    ["href", "/page", 'href="/page"'],
    // The `?` breaks the scheme: the value is not a URL at all.
    ["href", "recherche?q=café:test", 'href="recherche?q=café:test"'],
    ["data", "javascript:alert(1)", 'data="#blocked"'],
    // Style objects: camelCase to kebab, syntax-carrying names dropped.
    ["style", { backgroundColor: "red" }, 'style="background-color:red"'],
    ["style", { "color:red;position": "fixed" }, ""],
    // Booleans: name alone on a boolean attribute, stringified otherwise.
    ["disabled", true, "disabled"],
    ["disabled", false, ""],
    ["data-active", true, 'data-active="true"'],
    ["data-active", false, 'data-active="false"'],
    // Text escaping.
    ["title", "a & b < c", 'title="a &amp; b &lt; c"'],
    // RawString: the developer's escape hatch, verbatim.
    ["title", raw("<b>trusted</b>"), 'title="<b>trusted</b>"'],
    // Numbers.
    ["tabIndex", 3, 'tabindex="3"'],
    // A RawString is an object: read as a style bag it would serialize as
    // `style="value:color:red"`. Tested before the style/class branches.
    ["style", raw("color:red"), 'style="color:red"'],
    // A class instance is neither a bag of declarations: it falls back to
    // its string form (shape only: the exact bytes depend on the runtime).
    ["style", new Date(0), null],
    // …and so is an array, except on `class` where it joins.
    ["class", ["a", "", "b"], 'class="a b"'],
    // Reserved keys and hostile names must produce nothing at all.
    ["children", "x", ""],
    ["key", "x", ""],
    ["ref", "x", ""],
    ["dangerouslySetInnerHTML", "x", ""],
    ['x"><script>alert(1)</script>', "y", ""],
    ["a b", "y", ""],
    ["a=b", "y", ""],
    ["null", null, ""],
    ["undefined", undefined, ""],
  ];

  for (const [key, value, expected] of CASES) {
    if (expected === null) {
      test(`${key}=${JSON.stringify(value) ?? String(value)}: string form`, () => {
        expect(serializeAttr(key, value).value).toMatch(/^style=".+"$/);
      });
      continue;
    }
    test(`${key}=${JSON.stringify(value) ?? String(value)}`, () => {
      expect(serializeAttr(key, value).value).toBe(expected);
    });
  }

  // The one error mode: a function cannot be serialized to HTML, whatever it
  // is called. The eslint-plugin's `no-unsafe-event-handlers` discourages the
  // practice at the source; the engine's only job is to fail loudly.
  test("a function throws, handler or not", () => {
    expect(() => serializeAttr("onClick", () => {})).toThrow(/not serializable/);
    expect(() => serializeAttr("title", () => {})).toThrow(/not serializable/);
  });
});

describe("buildAttrs URL safety", () => {
  test("blocks javascript: href", () => {
    const r = buildAttrs({ href: "javascript:alert(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("allows http href", () => {
    const r = buildAttrs({ href: "https://example.com" }, "div");
    expect(r).toContain("https://example.com");
  });

  test("allows relative href", () => {
    expect(buildAttrs({ href: "/page" }, "div")).toContain("/page");
    expect(buildAttrs({ href: "#section" }, "div")).toContain("#section");
  });

  test("non-URL attr is not checked", () => {
    const r = buildAttrs({ id: "javascript:fine" }, "div");
    expect(r).toContain("javascript:fine");
  });

  test("blocks javascript: src", () => {
    const r = buildAttrs({ src: "javascript:alert(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("className is resolved before URL check", () => {
    const r = buildAttrs({ className: "foo" }, "div");
    expect(r).toContain('class="foo"');
  });

  test("blocks vbscript: href", () => {
    const r = buildAttrs({ href: "vbscript:msgbox(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("blocks javascript: action", () => {
    const r = buildAttrs({ action: "javascript:alert(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("blocks javascript: formaction", () => {
    const r = buildAttrs({ formaction: "javascript:alert(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("xlink:href is blocked (SVG <a> execution vector)", () => {
    const r = buildAttrs({ xlinkHref: "javascript:alert(1)" }, "div");
    expect(r).toContain("#blocked");
  });

  test("srcset is not checked (no JS execution vector)", () => {
    const r = buildAttrs({ srcSet: "javascript:alert(1) 1x" }, "div");
    expect(r).toContain('srcset="javascript:alert(1) 1x"');
  });

  test("RawString bypasses URL safety", () => {
    const r = buildAttrs({ href: raw("javascript:fn()") }, "div");
    expect(r).toContain('href="javascript:fn()"');
    expect(r).not.toContain("#blocked");
  });

  test("mailto: href passes through", () => {
    const r = buildAttrs({ href: "mailto:user@example.com" }, "div");
    expect(r).toContain("mailto:user@example.com");
  });

  test("data:image href passes through", () => {
    const r = buildAttrs({ href: "data:image/png;base64,abc" }, "div");
    expect(r).toContain("data:image/png;base64,abc");
  });

  test("non-image data: URI is blocked", () => {
    const r = buildAttrs({ href: "data:text/html,<script>alert(1)</script>" }, "div");
    expect(r).toContain("#blocked");
  });

  test("blocks scheme obfuscated with tab / leading NUL", () => {
    expect(buildAttrs({ href: "java\tscript:alert(1)" }, "div")).toContain("#blocked");
    expect(buildAttrs({ href: "\0javascript:alert(1)" }, "div")).toContain("#blocked");
    expect(buildAttrs({ src: "java\nscript:alert(1)" }, "div")).toContain("#blocked");
  });

  test("blocks javascript: on <object data>", () => {
    expect(buildAttrs({ data: "javascript:alert(1)" }, "div")).toContain("#blocked");
    expect(buildAttrs({ data: "/model.json" }, "div")).toContain('data="/model.json"');
  });
});

// ── URL_ATTRIBUTES ─────────────────────────────────────────────────────────

describe("URL_ATTRIBUTES", () => {
  test("contains href, src, action, formaction, xlink:href", () => {
    expect(URL_ATTRIBUTES.has("href")).toBe(true);
    expect(URL_ATTRIBUTES.has("src")).toBe(true);
    expect(URL_ATTRIBUTES.has("action")).toBe(true);
    expect(URL_ATTRIBUTES.has("formaction")).toBe(true);
    expect(URL_ATTRIBUTES.has("xlink:href")).toBe(true);
  });

  // `<object data>` navigates the same way `<iframe src>` does; `src` was
  // already covered, `data` was the gap.
  test("contains data (<object data>)", () => {
    expect(URL_ATTRIBUTES.has("data")).toBe(true);
  });

  test("does not contain non-URL attributes", () => {
    expect(URL_ATTRIBUTES.has("id")).toBe(false);
    expect(URL_ATTRIBUTES.has("class")).toBe(false);
    expect(URL_ATTRIBUTES.has("style")).toBe(false);
    expect(URL_ATTRIBUTES.has("srcset")).toBe(false);
  });

  test("has exactly 6 entries", () => {
    expect(URL_ATTRIBUTES.size).toBe(6);
  });

  // The SMIL names are judged too, but kept out of this set: it answers
  // "always a URL", and these four only carry one on an animation element.
  test("the SMIL value names are not URL attributes proper", () => {
    for (const name of ANIMATED_URL_ATTRIBUTES) expect(URL_ATTRIBUTES.has(name)).toBe(false);
  });
});

// ── SMIL: a URL, or a handler, written one attribute removed ───────────────
//
// `<animate attributeName="href" values="javascript:…">` is a `href` the source
// never spells. Both halves are asserted here: the value is judged as a URL
// whatever it animates, and an animation aimed at a handler is refused outright,
// because `to="alert(1)"` carries no scheme for a URL check to catch.

describe("SMIL animation: the value is URL-judged", () => {
  for (const name of ["values", "to", "from", "by"]) {
    test(`${name} carrying javascript: is blocked on an animation`, () => {
      expect(
        buildAttrs({ attributeName: "href", [name]: "javascript:alert(1)" }, "animate"),
      ).toContain("#blocked");
    });

    test(`${name} carrying a non-image data: is blocked on an animation`, () => {
      const out = buildAttrs(
        { attributeName: "href", [name]: "data:text/html,<script>alert(1)</script>" },
        "set",
      );
      expect(out).toContain("#blocked");
    });

    // A real SMIL value carries no scheme, so `schemeOf` answers `undefined` and
    // the animation is untouched — which is what makes scoping the check to the
    // five animation tags free rather than a trade-off.
    test(`${name} carrying a schemeless value is untouched`, () => {
      expect(buildAttrs({ attributeName: "opacity", [name]: "1" }, "animate")).toContain('="1"');
    });
  }

  test("an obfuscated scheme is caught, like any other URL", () => {
    expect(
      buildAttrs({ attributeName: "href", values: "java\tscript:alert(1)" }, "animate"),
    ).toContain("#blocked");
  });

  test("each item of a value list is judged, not the list as one URL", () => {
    // The animation applies `values` item by item: the second item is a href.
    expect(
      buildAttrs({ attributeName: "href", values: "#;javascript:alert(1)" }, "animate"),
    ).toContain('values="#blocked"');
    expect(buildAttrs({ attributeName: "href", values: "#a; #b" }, "animate")).toContain(
      'values="#a; #b"',
    );
  });

  test("names are judged as serialized, whatever their case", () => {
    // The parser lowercases both, then adjusts `attributename` in SVG.
    for (const attrs of [
      { attributename: "href", values: "javascript:alert(1)" },
      { attributeName: "href", VALUES: "javascript:alert(1)" },
    ]) {
      expect(buildAttrs(attrs, "animate")).toContain('values="#blocked"');
    }
  });

  test("the tag is judged whatever its case", () => {
    for (const tag of ["aNIMATE", "SET", "animateMotion", "animateTransform"]) {
      expect(buildAttrs({ attributeName: "href", to: "javascript:alert(1)" }, tag)).toContain(
        "#blocked",
      );
    }
  });

  test("every animation tag is covered, not just animate", () => {
    for (const tag of ["animate", "set", "animatetransform", "animatemotion", "animatecolor"]) {
      expect(buildAttrs({ attributeName: "href", to: "javascript:alert(1)" }, tag)).toContain(
        "#blocked",
      );
    }
  });

  test("the whole pair, as an animation writes it", async () => {
    const html = await renderToString(
      jsx("animate", { attributeName: "href", values: "javascript:alert(1)" }),
    );
    expect(html).toContain('values="#blocked"');
    expect(html).not.toContain("javascript:");
  });

  test("a legitimate animation renders unchanged", async () => {
    const html = await renderToString(
      jsx("animate", { attributeName: "opacity", values: "0;1;0", dur: "2s" }),
    );
    expect(html).toContain('values="0;1;0"');
  });

  test("a transform animation keeps its value list", async () => {
    const html = await renderToString(
      jsx("animateTransform", {
        attributeName: "transform",
        type: "rotate",
        from: "0",
        to: "360",
        dur: "1s",
      }),
    );
    expect(html).toContain('from="0"');
    expect(html).toContain('to="360"');
  });

  test("a data: image stays a data: image", () => {
    expect(
      buildAttrs({ attributeName: "href", values: "data:image/png;base64,iVBOR" }, "animate"),
    ).toContain("data:image/png");
  });

  // The scoping itself, which is the property that makes the check free: these
  // four names are ordinary data everywhere else, and an inert element carrying
  // one is as unremarkable as an inert element carrying `id`.
  test("on an element that animates nothing, the same value is left alone", () => {
    expect(buildAttrs({ to: "javascript:alert(1)" }, "div")).toBe(' to="javascript:alert(1)"');
    expect(buildAttrs({ values: "javascript:alert(1)" }, "span")).toBe(
      ' values="javascript:alert(1)"',
    );
    expect(buildAttrs({ from: "2019", by: "1" }, "my-widget")).toBe(' from="2019" by="1"');
  });

  test("and the names are not URL attributes in their own right", () => {
    // The reason the check needs the tag: `attrMeta` is a name-only answer, and
    // the lint rule asks exactly this.
    for (const name of ANIMATED_URL_ATTRIBUTES) expect(attrMeta(name).isUrl).toBe(false);
    expect(attrMeta("to").isUrl).toBe(false);
  });
});

describe("SMIL animation: a handler target is refused", () => {
  test("attributeName naming on* throws, with the stable code", () => {
    expect(() => buildAttrs({ attributeName: "onclick", to: "alert(1)" }, "set")).toThrow(
      /animates an event handler/,
    );
    try {
      buildAttrs({ attributeName: "onmouseover", to: "alert(1)" }, "set");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("ERR_VINCLE_ANIMATED_HANDLER");
    }
  });

  test("a target is judged on the text it serializes to", () => {
    for (const target of [raw("onclick"), rawUrl("onclick"), ["onclick"], " onclick"]) {
      expect(() => buildAttrs({ attributeName: target, to: "alert(1)" }, "set")).toThrow(
        /animates an event handler/,
      );
    }
    expect(() => buildAttrs({ attributename: "onclick", to: "alert(1)" }, "set")).toThrow(
      /animates an event handler/,
    );
  });

  test("nothing is emitted for a refused element", () => {
    // Fail-stop: half a start tag is worse than none.
    let out: unknown;
    try {
      out = buildAttrs({ attributeName: "onclick", to: "alert(1)", id: "x" }, "set");
    } catch {
      out = undefined;
    }
    expect(out).toBeUndefined();
  });

  test("a URL target is not refused: it is filtered, and that is enough", () => {
    expect(buildAttrs({ attributeName: "href", to: "javascript:alert(1)" }, "set")).toContain(
      "#blocked",
    );
  });

  test("a non-handler target passes through", () => {
    expect(buildAttrs({ attributeName: "fill", to: "red" }, "set")).toContain('to="red"');
  });

  test("a handler target with nothing to write is inert, and passes", () => {
    // The same condition `@vincle/precompile` uses to decide whether declining
    // the element would change anything: no value, no animation, no refusal.
    expect(buildAttrs({ attributeName: "onclick" }, "set")).toContain('attributeName="onclick"');
    expect(buildAttrs({ attributeName: "onclick", dur: "1s" }, "set")).toContain(
      'attributeName="onclick"',
    );
  });

  test("every one of the four value attributes is enough to trip it", () => {
    for (const name of ANIMATED_URL_ATTRIBUTES) {
      expect(() => buildAttrs({ attributeName: "onclick", [name]: "alert(1)" }, "set")).toThrow(
        /animates an event handler/,
      );
    }
  });

  // The tag is part of the rule, so an inert element carrying the pair is not a
  // refused element: `attributeName` is SMIL vocabulary and means nothing here.
  test("the same pair on an element that animates nothing is inert", () => {
    expect(buildAttrs({ attributeName: "onclick", to: "alert(1)" }, "div")).toBe(
      ' attributeName="onclick" to="alert(1)"',
    );
  });

  // A polluted prototype must not make every element in the process throw.
  test("an inherited attributeName is not the element's own", () => {
    expect(polluted("attributeName", "onclick", () => buildAttrs({ to: "red" }, "set"))).toContain(
      'to="red"',
    );
  });
});

describe("isAnimationTag", () => {
  test("the five elements a browser recognises", () => {
    for (const tag of ["animate", "set", "animatetransform", "animatemotion", "animatecolor"]) {
      expect(isAnimationTag(tag)).toBe(true);
    }
  });

  test("and nothing else animates", () => {
    expect(isAnimationTag("div")).toBe(false);
    expect(isAnimationTag("svg")).toBe(false);
    expect(isAnimationTag("section")).toBe(false);
    expect(isAnimationTag("animates")).toBe(false);
    expect(isAnimationTag("animation")).toBe(false);
    expect(isAnimationTag("")).toBe(false);
  });
});

describe("isEventHandlerName", () => {
  test("matches on* whatever the case", () => {
    expect(isEventHandlerName("onclick")).toBe(true);
    expect(isEventHandlerName("ONCLICK")).toBe(true);
    expect(isEventHandlerName("onanimationstart")).toBe(true);
  });

  // Over-matching is the safe direction here: a name no QName parser would
  // accept animates nothing, so refusing it costs nothing either.
  test("does not match an attribute that merely contains on", () => {
    expect(isEventHandlerName("font")).toBe(false);
    expect(isEventHandlerName("action")).toBe(false);
    expect(isEventHandlerName("icon")).toBe(false);
  });
});

describe("attrMeta: the URL question stays a name's own", () => {
  test("the six navigable names", () => {
    for (const name of URL_ATTRIBUTES) expect(attrMeta(name).isUrl).toBe(true);
  });

  test("the four animated names are not among them", () => {
    // `no-javascript-urls` asks exactly this, and an element is not in reach of
    // a rule that visits attributes: that is why the animation check lives in
    // `buildAttrs` rather than here.
    for (const name of ANIMATED_URL_ATTRIBUTES) expect(attrMeta(name).isUrl).toBe(false);
  });
});

describe("rawUrl: a trusted scheme, and nothing else", () => {
  test("a custom protocol handler passes, which is the whole point", () => {
    expect(buildAttrs({ href: rawUrl("phpstorm://open?file=src/app.ts") }, "a")).toBe(
      ' href="phpstorm://open?file=src/app.ts"',
    );
  });

  // The two escape hatches answer different questions, and an audit has to be
  // able to tell which one a call site reached for. So this one keeps escaping:
  // it is not a way to smuggle markup through an attribute.
  test("the value is still escaped: it cannot end its attribute", () => {
    const r = buildAttrs({ href: rawUrl('phpstorm://x" onmouseover="alert(1)') }, "a");
    expect(r).toBe(' href="phpstorm://x&quot; onmouseover=&quot;alert(1)"');
  });

  test("`&` in a query string is escaped like any other value", () => {
    expect(buildAttrs({ href: rawUrl("myapp://go?a=1&b=2") }, "a")).toBe(
      ' href="myapp://go?a=1&amp;b=2"',
    );
  });

  test("a trusted scheme skips the check, as asserted", () => {
    // The documented consequence: `rawUrl` says "I vouch for this value". What
    // separates it from `raw()` is that escaping survives.
    expect(buildAttrs({ href: rawUrl("javascript:alert(1)") }, "a")).toBe(
      ' href="javascript:alert(1)"',
    );
  });

  test("a non-URL attribute takes it as the string it is", () => {
    expect(buildAttrs({ title: rawUrl("a<b") }, "div")).toBe(' title="a&lt;b"');
  });

  test("an animation value takes it too", () => {
    expect(buildAttrs({ values: rawUrl("myapp://x") }, "animate")).toBe(' values="myapp://x"');
  });

  test("the precompile path agrees, byte for byte", () => {
    expect(serializeAttr("href", rawUrl("phpstorm://open")).value).toBe('href="phpstorm://open"');
  });
});

describe("rawUrl in content position is text, not markup", () => {
  test("a RawUrl child is escaped", async () => {
    // The difference from `raw()` the separate type exists for: a URL has no
    // scheme to vouch for in a text position, so it is escaped like one.
    const html = await renderToString(jsx("p", { children: rawUrl("<b>x</b>&y") }));
    expect(html).toBe("<p>&lt;b&gt;x&lt;/b&gt;&amp;y</p>");
  });

  test("where a RawString is verbatim", async () => {
    expect(await renderToString(jsx("p", { children: raw("<b>x</b>") }))).toBe("<p><b>x</b></p>");
  });

  test("inside <script>, the rawtext rule still applies", async () => {
    const html = await renderToString(jsx("script", { children: rawUrl("</script>x") }));
    expect(html).toBe("<script>\\u003c/script>x</script>");
  });

  test("valueToText does not stringify it into [object Object]", () => {
    expect(valueToText(rawUrl("https://example.com"))).toBe("https://example.com");
  });
});

// ── React alias collision ──────────────────────────────────────────────────

describe("buildAttrs alias resolution", () => {
  test("native name wins over its React alias", () => {
    const r = buildAttrs({ className: "from-alias", class: "from-native" }, "div");
    expect(r).toBe(' class="from-native"');
  });

  // `attrName in attrs` walked the prototype chain, so a resolved name that
  // happens to be an `Object.prototype` key looked like an existing native prop
  // and the attribute was dropped with no output and no error.
  test("a name resolving onto Object.prototype is still emitted", () => {
    expect(buildAttrs({ Constructor: "x" }, "div")).toBe(' constructor="x"');
    expect(buildAttrs({ __Proto__: "x" }, "div")).toBe(' __proto__="x"');
    expect(buildAttrs({ ToString: "x" }, "div")).toBe(' tostring="x"');
  });
});

// ── Style objects ──────────────────────────────────────────────────────────

describe("buildAttrs style", () => {
  test("camelCase is kebab-cased", () => {
    expect(buildAttrs({ style: { backgroundColor: "red" } }, "div")).toBe(
      ' style="background-color:red"',
    );
  });

  // `ms` is the one vendor prefix spelled lowercase, so the kebab-case rule
  // leaves it without its leading dash: a declaration no browser applies.
  test("the -ms- prefix keeps its leading dash", () => {
    expect(buildAttrs({ style: { msFlexAlign: "center" } }, "div")).toBe(
      ' style="-ms-flex-align:center"',
    );
    expect(buildAttrs({ style: { WebkitBoxOrient: "vertical" } }, "div")).toBe(
      ' style="-webkit-box-orient:vertical"',
    );
    expect(buildAttrs({ style: { "--brand-color": "red" } }, "div")).toBe(
      ' style="--brand-color:red"',
    );
  });

  // A key carrying `:` or `;` smuggled extra declarations into the attribute.
  test("property names carrying CSS syntax are dropped", () => {
    expect(buildAttrs({ style: { "color:red;position": "fixed" } }, "div")).toBe("");
    expect(buildAttrs({ style: { color: "red", "a;b": "c" } }, "div")).toBe(' style="color:red"');
    expect(buildAttrs({ style: { "}html{display": "none" } }, "div")).toBe("");
  });

  // A value carrying `;` used to pass through verbatim and inject declarations
  // exactly as a smuggled name did. Values are repaired rather than dropped,
  // `url(data:…;base64,…)` is legitimate. CSS-escaping `\` and `;` in one
  // pass preserves how browsers parse the value.
  test("values carrying CSS syntax are escaped, not passed through", () => {
    expect(buildAttrs({ style: { color: "red;position:fixed" } }, "div")).toBe(
      ' style="color:red\\;position:fixed"',
    );
    // A pre-existing backslash must not survive to re-arm the separator.
    expect(buildAttrs({ style: { color: "red\\;position:fixed" } }, "div")).toBe(
      ' style="color:red\\\\\\;position:fixed"',
    );
    expect(buildAttrs({ style: { background: "url(data:image/png;base64,iVBOR)" } }, "div")).toBe(
      ' style="background:url(data:image/png\\;base64,iVBOR)"',
    );
  });

  test("a control character drops its declaration, like an invalid name", () => {
    expect(buildAttrs({ style: { color: "re\u0000d" } }, "div")).toBe("");
    expect(buildAttrs({ style: { color: "red", background: "bl\u0007ue" } }, "div")).toBe(
      ' style="color:red"',
    );
  });

  test("custom properties survive", () => {
    expect(buildAttrs({ style: { "--brand": "#0af" } }, "div")).toBe(' style="--brand:#0af"');
  });
});

// ── Attribute name resolution ──────────────────────────────────────────────
//
// `resolveAttrName` is the single authority on what an attribute is *called* in
// the document, and `@vincle/precompile` re-exports it to inline names at
// build time. It had no test at all: a wrong entry, or a missing one, produced an
// attribute the browser ignores: no error, no visible failure, just a style that
// never applied. That is how seventy SVG presentation attributes came to be
// emitted as `strokewidth`.
//
// The expectations below are written by hand from the specs. That matters: the
// hyphenated table derives its values with `camelToKebab`, so a test that derived
// them the same way would only prove the derivation equals itself.

describe("resolveAttrName", () => {
  const CASES: [string, string][] = [
    // Aliases: the HTML name shares no shape with the React one.
    ["className", "class"],
    ["htmlFor", "for"],
    ["acceptCharset", "accept-charset"],
    ["httpEquiv", "http-equiv"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xmlLang", "xml:lang"],
    ["xmlBase", "xml:base"],
    ["xmlSpace", "xml:space"],
    // The whole xlink family, not just `href`.
    ["xlinkHref", "xlink:href"],
    ["xlinkActuate", "xlink:actuate"],
    ["xlinkArcrole", "xlink:arcrole"],
    ["xlinkRole", "xlink:role"],
    ["xlinkShow", "xlink:show"],
    ["xlinkTitle", "xlink:title"],
    ["xlinkType", "xlink:type"],
    // SVG presentation attributes: hyphenated in the spec.
    ["strokeWidth", "stroke-width"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["clipPath", "clip-path"],
    ["textAnchor", "text-anchor"],
    ["dominantBaseline", "dominant-baseline"],
    ["fontFamily", "font-family"],
    ["stopColor", "stop-color"],
    ["pointerEvents", "pointer-events"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["xHeight", "x-height"],
    ["vertOriginY", "vert-origin-y"],
    // SVG attributes that are camelCase in the spec: untouched.
    ["viewBox", "viewBox"],
    ["preserveAspectRatio", "preserveAspectRatio"],
    ["patternContentUnits", "patternContentUnits"],
    ["attributeName", "attributeName"],
    ["refX", "refX"],
    ["stdDeviation", "stdDeviation"],
    ["zoomAndPan", "zoomAndPan"],
    ["textLength", "textLength"],
    // Everything else lowercases: no entry needed, and none should exist.
    ["tabIndex", "tabindex"],
    ["readOnly", "readonly"],
    ["maxLength", "maxlength"],
    ["minLength", "minlength"],
    ["autoFocus", "autofocus"],
    ["autoComplete", "autocomplete"],
    ["encType", "enctype"],
    ["noValidate", "novalidate"],
    ["dateTime", "datetime"],
    ["srcSet", "srcset"],
    ["charSet", "charset"],
    ["crossOrigin", "crossorigin"],
    ["spellCheck", "spellcheck"],
    ["inputMode", "inputmode"],
    ["contentEditable", "contenteditable"],
    ["autoCapitalize", "autocapitalize"],
    // Already-HTML names pass straight through.
    ["class", "class"],
    ["id", "id"],
    ["data-turbo", "data-turbo"],
    ["aria-hidden", "aria-hidden"],
    ["stroke-width", "stroke-width"],
    ["nonce", "nonce"],
    ["property", "property"],
  ];

  for (const [input, expected] of CASES) {
    test(`${input} → ${expected}`, () => {
      expect(resolveAttrName(input)).toBe(expected);
    });
  }

  test("resolution is idempotent: a resolved name resolves to itself", () => {
    for (const [, expected] of CASES) {
      expect(resolveAttrName(expected)).toBe(expected);
    }
  });

  test("every resolved name is a legal attribute name", () => {
    for (const [input] of CASES) {
      expect(isValidAttrName(resolveAttrName(input))).toBe(true);
    }
  });
});

describe("resolveAttrName tables are consistent", () => {
  const { SVG_HYPHENATED, SVG_CASE_SENSITIVE } = ATTR_NAME_TABLES;

  test("no name is in both tables", () => {
    expect([...SVG_HYPHENATED.keys()].filter((k) => SVG_CASE_SENSITIVE.has(k))).toEqual([]);
  });

  // A table entry whose key already survives `toLowerCase()` unchanged would be
  // dead weight: the default branch would produce the same answer.
  test("every entry earns its place", () => {
    for (const [key, value] of SVG_HYPHENATED) {
      expect(value).not.toBe(key.toLowerCase());
      expect(value).toContain("-");
    }
    for (const key of SVG_CASE_SENSITIVE) {
      expect(key).not.toBe(key.toLowerCase());
    }
  });

  // The name the document carries must still be a name, whatever the table says.
  test("every table target is a legal attribute name", () => {
    for (const value of SVG_HYPHENATED.values()) expect(isValidAttrName(value)).toBe(true);
    for (const key of SVG_CASE_SENSITIVE) expect(isValidAttrName(key)).toBe(true);
  });
});

// ── Style objects, non-plain values ────────────────────────────────────────

describe("buildAttrs style: only an object literal is a bag of declarations", () => {
  test("a RawString is the developer's escape hatch, not a style bag", () => {
    // Read as a bag, `raw()`'s own `value` property became a declaration:
    // `style="value:color:red"`. `jsxAttr` never had the bug.
    expect(buildAttrs({ style: raw("color:red") }, "div")).toBe(' style="color:red"');
  });

  test("a class instance falls back to its string form instead of vanishing", () => {
    // Enumerating a Date's own keys yields nothing, so the attribute used to be
    // dropped in silence.
    const r = buildAttrs({ style: new Date(0) }, "div");
    expect(r).toContain(" style=");
  });

  test("an object with a null prototype is still a style bag", () => {
    const bag = Object.assign(Object.create(null) as object, { color: "red" });
    expect(buildAttrs({ style: bag }, "div")).toBe(' style="color:red"');
  });

  test("an array style is not a bag either", () => {
    expect(buildAttrs({ style: ["color:red"] }, "div")).toBe(' style="color:red"');
  });
});

// ── The trust boundary of an attribute ─────────────────────────────────────

describe("an attribute name must name something", () => {
  // The empty name emitted ` ="v"`, which a parser reads as an attribute called
  // `="v"` does not inject code because the value stays escaped, but it is
  // not a valid attribute name either.
  test("the empty name is not a name", () => {
    expect(isValidAttrName("")).toBe(false);
    expect(buildAttrs({ "": 'x" onload="alert(1)' }, "div")).toBe("");
  });

  test("a backtick is legal in a name, and stays legal", () => {
    // Only ever a quote in attribute *values*, in browsers no longer shipped.
    expect(isValidAttrName("a`b")).toBe(true);
  });
});

// A prototype-pollution bug in the application is a primitive, not an
// exploit: it needs somewhere that *reads* a property it never wrote. A
// `for…in` over props was such a place, on every element of every page.
const polluted = <T>(key: string, value: unknown, fn: () => T): T => {
  (Object.prototype as Record<string, unknown>)[key] = value;
  try {
    return fn();
  } finally {
    delete (Object.prototype as Record<string, unknown>)[key];
  }
};

describe("buildAttrs: the props object is read, not its prototype", () => {
  test("an inherited property is not an attribute", () => {
    expect(polluted("onload", "alert(1)", () => buildAttrs({ class: "ok" }, "div"))).toBe(
      ' class="ok"',
    );
  });

  test("…nor on the async path, where the copy would make it an own property", async () => {
    const r = await polluted("onload", "alert(1)", () =>
      buildAttrs({ class: "ok", title: Promise.resolve("t") }, "div"),
    );
    expect(r).toBe(' class="ok" title="t"');
  });

  test("…nor a declaration in a style bag", () => {
    expect(
      polluted("position", "fixed", () => buildAttrs({ style: { color: "red" } }, "div")),
    ).toBe(' style="color:red"');
  });
});

// Same gadget, the three reads the attribute loops don't cover. `children` and
// `dangerouslySetInnerHTML` are read by key, once in `jsx()` and once on the
// static path, and `dangerouslySetInnerHTML` bypasses the escaping chain, so it
// is the one that turns the primitive into injected markup rather than a stray
// attribute. Both paths are asserted: the static path owns the static case, which
// is the common one, and only `jsx()` sees `dangerouslySetInnerHTML`.
describe("the children are read from the props object, not its prototype", () => {
  test("an inherited `children` is not content: static path", async () => {
    const html = await polluted("children", "POLLUTED", () =>
      renderToString(jsx("div", { class: "ok" })),
    );
    expect(html).toBe('<div class="ok"></div>');
  });

  test("…nor on a void element, where it also produced a closing tag", async () => {
    const html = await polluted("children", "POLLUTED", () => renderToString(jsx("br", {})));
    expect(html).toBe("<br>");
  });

  test("…nor through the tree walk, which the static path declines to", async () => {
    const html = await polluted("children", "POLLUTED", () =>
      renderToString(jsx("div", { title: Promise.resolve("t") })),
    );
    expect(html).toBe('<div title="t"></div>');
  });

  test("an inherited `dangerouslySetInnerHTML` does not inject markup", async () => {
    const html = await polluted(
      "dangerouslySetInnerHTML",
      { __html: "<img src=x onerror=alert(1)>" },
      () => renderToString(jsx("div", { class: "ok" })),
    );
    expect(html).toBe('<div class="ok"></div>');
  });
});

describe("a RawString attribute value cannot end the attribute", () => {
  // `raw()` promises trusted *markup*, which is not "trusted attribute value":
  // the quote that ends the value is the one character it must not carry.
  test('`"` is escaped, on both serializers', () => {
    const attack = raw('" onmouseover="alert(1)');
    expect(buildAttrs({ title: attack }, "div")).toBe(' title="&quot; onmouseover=&quot;alert(1)"');
    expect(serializeAttr("title", attack).value).toBe('title="&quot; onmouseover=&quot;alert(1)"');
  });

  test("everything else stays verbatim", () => {
    // An entity, a `<`, an `&`: the point of `raw()`, and a CSS string, which
    // the parser decodes back to `"` before the CSS parser ever sees it.
    expect(buildAttrs({ title: raw("<b>a &amp; b</b>") }, "div")).toBe(' title="<b>a &amp; b</b>"');
    expect(buildAttrs({ style: raw('font-family:"Foo"') }, "div")).toBe(
      ' style="font-family:&quot;Foo&quot;"',
    );
  });
});
