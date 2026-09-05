import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { renderToString } from "@vincle/core";
import { jsx, jsxAttr, jsxEscape } from "@vincle/core/jsx-runtime";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import precompileTransform from "./transformer.js";

const RT = "@vincle/core/jsx-runtime";

/**
 * A foreign runtime: no serializer injected, so the output is Deno's.
 *
 * There is no option to pass — the transform emits the reference output for
 * every runtime but one, and `transformVincle` below is that one.
 */
function transform(code: string, id = "/src/app.tsx"): string {
  const result = precompileTransform(code, id, { runtimeSource: RT });
  if (!result) throw new Error("expected a transform result, got null");
  return result.code;
}

/** A runtime declaring the `"vincle"` dialect: corrected, sanitized output. */
function transformVincle(code: string, id = "/src/app.tsx"): string {
  const result = precompileTransform(code, id, { runtimeSource: RT }, jsxAttr, jsxEscape);
  if (!result) throw new Error("expected a transform result, got null");
  return result.code;
}

describe("precompileTransform", () => {
  it("returns null when there is no JSX", () => {
    expect(precompileTransform("const x = 1;", "/src/app.tsx")).toBeNull();
  });

  it("emits jsxTemplate and the runtime import for a static element", () => {
    const out = transform(`const a = <div class="x">hello</div>;`);
    expect(out).toContain(`import { jsxTemplate } from "${RT}";`);
    expect(out).toContain('jsxTemplate`<div class="x">hello</div>`');
  });

  it("wraps dynamic children in jsxEscape", () => {
    const out = transform(`const a = <div>{name}</div>;`);
    expect(out).toContain(`import { jsxTemplate, jsxEscape } from "${RT}";`);
    expect(out).toContain("${jsxEscape(name)}");
  });

  it("serializes dynamic attributes with jsxAttr", () => {
    const out = transform(`const a = <a href={url} class="link">go</a>;`);
    expect(out).toContain("jsxAttr");
    expect(out).toContain('${jsxAttr("href", url)}');
    // static attribute stays inline
    expect(out).toContain('class="link"');
  });

  it("precompiles JSX nested inside an expression (ternary)", () => {
    const out = transform(`const a = <div>{cond ? <span>a</span> : <b>b</b>}</div>;`);
    expect(out).toContain("jsxEscape(cond ? jsxTemplate`<span>a</span>` : jsxTemplate`<b>b</b>`)");
  });

  it("precompiles JSX returned from a .map() callback", () => {
    const out = transform(`const a = <ul>{items.map((i) => <li>{i}</li>)}</ul>;`);
    expect(out).toContain("items.map((i) => jsxTemplate`<li>${jsxEscape(i)}</li>`)");
  });

  it("flattens fragments into the parent template", () => {
    const out = transform(`const a = <><li>one</li><li>two</li></>;`);
    expect(out).toContain("jsxTemplate`<li>one</li><li>two</li>`");
  });

  it("passes component children through to jsxTemplate unwrapped (Deno contract)", () => {
    const out = transform(`const a = <div><Foo x={1} /></div>;`);
    expect(out).toContain("${<Foo x={1} />}");
    expect(out).not.toContain("jsxEscape(<Foo x={1} />)");
  });

  it("keeps jsxEscape on plain expressions inside the template", () => {
    const out = transform(`const a = <div>{name}</div>;`);
    expect(out).toContain("${jsxEscape(name)}");
  });

  it("does not emit a closing tag for void elements", () => {
    expect(transform(`const a = <input disabled />;`)).toContain("jsxTemplate`<input disabled>`");
    expect(transform(`const a = <input value={v} />;`)).toContain('${jsxAttr("value", v)}>`');
    expect(transform(`const a = <input value={v} />;`)).not.toContain("</input>");
  });

  it("does not emit a closing tag for dynamic void elements nested in a parent", () => {
    const out = transform(`const a = <div><img src={s} alt="x" /></div>;`);
    expect(out).toContain('<div><img ${jsxAttr("src", s)} alt="x"></div>');
    expect(out).not.toContain("</img>");
  });

  it("escapes static literal attribute values", () => {
    expect(transform(`const a = <div title='a"b'>x</div>;`)).toContain('title="a&quot;b"');
    expect(transform(`const a = <div data-x="a&b<c">x</div>;`)).toContain('data-x="a&amp;b&lt;c"');
  });

  it("does not over-escape clean attribute values", () => {
    expect(transform(`const a = <a title="go now" class="link">go</a>;`)).toContain(
      '<a title="go now" class="link">go</a>',
    );
  });

  it("emits a proper closing tag for static non-void child elements", () => {
    expect(transform(`const a = <div><span/></div>;`)).toContain(
      "jsxTemplate`<div><span></span></div>`",
    );
  });

  it("emits no closing tag and no slash for static void child elements", () => {
    const out = transform(`const a = <div>a<br/>b</div>;`);
    expect(out).toContain("jsxTemplate`<div>a<br>b</div>`");
    expect(out).not.toContain("<br/>");
    expect(out).not.toContain("</br>");
  });

  it("keeps nested static elements byte-identical to handwritten HTML", () => {
    expect(transform(`const a = <div><span class="y">deep</span></div>;`)).toContain(
      'jsxTemplate`<div><span class="y">deep</span></div>`',
    );
  });

  it("collapses JSX whitespace between elements (standard JSX rules)", () => {
    const out = transform(
      `const a = (
        <ul>
          <li>one</li>
          <li>two</li>
        </ul>
      );`,
    );
    expect(out).toContain("jsxTemplate`<ul><li>one</li><li>two</li></ul>`");
  });

  it("preserves significant inline whitespace", () => {
    const out = transform(`const a = <p>hello <b>world</b></p>;`);
    expect(out).toContain("jsxTemplate`<p>hello <b>world</b></p>`");
  });

  it("inlines static attributes by default (Deno-aligned, no jsxAttr)", () => {
    const out = transform(`const a = <div class="x" id="y">z</div>;`);
    expect(out).toContain('<div class="x" id="y">');
    expect(out).not.toContain("jsxAttr");
  });

  it("remaps camelCase attribute names to HTML at compile time (inlined)", () => {
    expect(transform(`const a = <div className="box">x</div>;`)).toContain(
      '<div class="box">x</div>',
    );
    expect(transform(`const a = <label htmlFor="id">x</label>;`)).toContain(
      '<label for="id">x</label>',
    );
    expect(transform(`const a = <div tabIndex="0">x</div>;`)).toContain(
      '<div tabindex="0">x</div>',
    );
    // stays static — no runtime call
    expect(transform(`const a = <div className="box">x</div>;`)).not.toContain("jsxAttr");
  });

  it("remaps camelCase boolean attribute names too", () => {
    expect(transform(`const a = <input readOnly />;`)).toContain("jsxTemplate`<input readonly>`");
  });

  it("lowercases event-handler names and inlines them (Deno-aligned)", () => {
    expect(transform(`const a = <button onClick="go()">x</button>;`)).toContain(
      '<button onclick="go()">x</button>',
    );
  });

  it("inlines URL and style attributes verbatim by default (trusted)", () => {
    expect(transform(`const a = <a href="javascript:alert(1)">x</a>;`)).toContain(
      '<a href="javascript:alert(1)">x</a>',
    );
    expect(transform(`const a = <div style="color:red">x</div>;`)).toContain(
      '<div style="color:red">x</div>',
    );
    expect(transform(`const a = <img srcSet="a.png 1x" />;`)).toContain('<img srcset="a.png 1x">');
  });

  describe("build-time sanitization", () => {
    it("sanitizes static URL attributes at build time (output stays static)", () => {
      const out = transformVincle(`const a = <a href="javascript:alert(1)">x</a>;`);
      expect(out).toContain('<a href="#blocked">x</a>');
      expect(out).not.toContain("jsxAttr"); // sanitized at build time, not at runtime
      expect(out).not.toContain("javascript:");
    });

    it("keeps safe URLs intact and still remaps names", () => {
      const out = transformVincle(`const a = <a href="/path" className="link">x</a>;`);
      expect(out).toContain('<a href="/path" class="link">x</a>');
    });

    it("passes through style values (CSS safety is deferred to the runtime)", () => {
      const out = transformVincle(
        `const a = <div style="background:url(javascript:alert(1))">x</div>;`,
      );
      expect(out).toContain("javascript:");
    });

    it("escapes static values through the runtime", () => {
      const out = transformVincle(`const a = <div title='a"b'>x</div>;`);
      expect(out).toContain("a&quot;b");
    });

    it("escapes static text content using the runtime's own jsxEscape", () => {
      const out = transformVincle(`const a = <div>hello & world</div>;`);
      // jsxEscape from @vincle/core escapes & < > — same as escapeContent
      // for Vincle. For other runtimes (Preact, Hono) the escaping differs;
      // using the runtime's own jsxEscape guarantees byte-identity.
      expect(out).toContain("jsxTemplate`<div>hello &amp; world</div>`");
    });

    it("decodes rawtext entities then escapeRawText (matches the dynamic runtime)", () => {
      // Default: decode entities (like the JS compiler does) then
      // escapeRawText — the same path renderChild takes — so `&gt;` becomes
      // a real `>` and the output is valid CSS/JS. Unlike Deno mode where
      // rawtext entities stay verbatim.
      const style = transformVincle("const a = <style>.a &gt; .b</style>;");
      expect(style).toContain("jsxTemplate`<style>.a > .b</style>`");
      const script = transformVincle("const a = <script>a &amp;&amp; b</script>;");
      expect(script).toContain("jsxTemplate`<script>a && b</script>`");
      // The element's own closing tag is neutralized (breakout guard).
      const guard = transformVincle("const a = <script>x &lt;/script&gt; y</script>;");
      expect(guard).not.toContain("</script> y");
    });
  });

  it("registers every helper it uses in a single import", () => {
    const out = transform(`const a = <a href={url}>{text}</a>;`);
    const importLine = out.split("\n")[0]!;
    expect(importLine).toContain("jsxTemplate");
    expect(importLine).toContain("jsxAttr");
    expect(importLine).toContain("jsxEscape");
    // exactly one import from the runtime
    expect(out.match(new RegExp(RT, "g"))?.length).toBe(1);
  });

  it("leaves elements with spread attributes untransformed", () => {
    expect(
      precompileTransform(`const a = <div {...props} id="x" />;`, "/src/app.tsx", {
        runtimeSource: RT,
      }),
    ).toBeNull();
  });

  it("merges missing helpers into an existing runtime import, preserving aliases", () => {
    const code = [
      `import { jsxTemplate as tpl } from "${RT}";`,
      `const a = <div>{name}</div>;`,
    ].join("\n");
    const result = precompileTransform(code, "/src/app.tsx", {
      runtimeSource: RT,
    })!;
    expect(result.code).toContain(
      `import { jsxTemplate as tpl, jsxTemplate, jsxEscape } from "${RT}";`,
    );
    expect(result.code.match(new RegExp(RT, "g"))?.length).toBe(1);
  });

  describe("sourcemaps", () => {
    function tracePosition(code: string, needle: string) {
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      if (!result?.map) throw new Error("expected a transform result with a map");
      const lines = result.code.split("\n");
      const lineIdx = lines.findIndex((l) => l.includes(needle));
      if (lineIdx < 0) throw new Error(`"${needle}" not found in output`);
      // @ts-expect-error — TraceMap accepts EncodedSourceMap but result.map is SourceMap from OXC; they're structurally compatible
      const tracer = new TraceMap(result.map);
      return originalPositionFor(tracer, {
        line: lineIdx + 1,
        column: lines[lineIdx]!.indexOf(needle),
      });
    }

    it("emits non-empty mappings when a transform happens", () => {
      const result = precompileTransform(`const a = <div>{name}</div>;`, "/src/app.tsx", {
        runtimeSource: RT,
      })!;
      expect(result.map).toBeDefined();
      expect(result.map!.mappings.length).toBeGreaterThan(0);
    });

    it("maps a dynamic expression back to its source line when the import is prepended", () => {
      // The injected import shifts every line down by one — the map must
      // describe the final code, not the pre-injection code (regression).
      const code = [`const before = 1;`, `const a = <div>{userName}</div>;`].join("\n");
      const pos = tracePosition(code, "userName");
      expect(pos.line).toBe(2);
    });

    it("maps a dynamic expression back to its source line when merging an existing import", () => {
      const code = [
        `import { jsxTemplate } from "${RT}";`,
        `const x = 1;`,
        `const a = <div>{userName}</div>;`,
      ].join("\n");
      const pos = tracePosition(code, "userName");
      expect(pos.line).toBe(3);
    });
  });

  describe("static content escaping", () => {
    it("escapes backticks in static text so codegen stays valid", () => {
      const out = transform("const a = <div>price `x`</div>;");
      expect(out).toContain("jsxTemplate`<div>price \\`x\\`</div>`");
      // the emitted module parses as valid JS
      expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(out)).not.toThrow();
    });

    it("escapes backticks in static attribute values", () => {
      const out = transform("const a = <div title='a`b'>x</div>;");
      expect(out).toContain('title="a\\`b"');
      expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(out)).not.toThrow();
    });

    it("serializes namespaced static attributes (xlink:href)", () => {
      const out = transformVincle('const a = <use xlink:href="#i" />;');
      expect(out).toContain('xlink:href="#i"');
      expect(out).not.toContain("[object Object]");
    });

    it("decodes then re-escapes entities in static text (Deno-aligned, byte-identical to the runtime)", () => {
      // Bare `&` → `&amp;`; `&amp;` round-trips to `&amp;`; named entities like
      // `&copy;` decode to their character (`©`). Verified against Deno's own
      // precompile transform.
      const out = transform("const a = <div>fish & chips &amp; &copy;</div>;");
      expect(out).toContain("jsxTemplate`<div>fish &amp; chips &amp; ©</div>`");
    });

    it("keeps `<` / `>` escaped after decoding (no breakout via &lt;)", () => {
      const out = transform("const a = <div>&lt;script&gt;alert(1)&lt;/script&gt;</div>;");
      expect(out).toContain("jsxTemplate`<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>`");

      expect(out).not.toContain("<script>");
    });

    it("keeps rawtext entities verbatim in compatibility mode", () => {
      // Rawtext entities stay literal — the HTML parser never decodes entities
      // in <script>/<style> content, so keeping them verbatim is safe and
      // matches Deno's own precompile output.
      const style = transform("const a = <style>.a &gt; .b</style>;");
      expect(style).toContain("jsxTemplate`<style>.a &gt; .b</style>`");
      const script = transform("const a = <script>a &amp;&amp; b</script>;");
      expect(script).toContain("jsxTemplate`<script>a &amp;&amp; b</script>`");
      // </script> encoded as entities stays safe — browser won't decode
      // entities in rawtext, so no breakout.
      const guard = transform("const a = <script>x &lt;/script&gt; y</script>;");
      expect(guard).toContain("&lt;/script&gt;");
    });

    it("…and decodes them for the vincle dialect", () => {
      // `escapeRawTagContent` applies: entities are decoded, so the CSS and JS
      // are what the author wrote, and the closing tag is neutralised.
      expect(transformVincle("const a = <style>.a &gt; .b</style>;")).toContain(
        "jsxTemplate`<style>.a > .b</style>`",
      );
      expect(transformVincle("const a = <script>x &lt;/script&gt; y</script>;")).toContain(
        "\\u003c/script>",
      );
    });
  });

  describe("the default mode renders what the runtime renders", () => {
    /**
     * Toggling the plugin changes no byte — the invariant the default mode
     * exists to hold, checked end to end rather than on the shape of the
     * generated code.
     *
     * Every entry is a case that diverged at some point or could: boolean
     * attributes with every kind of value, a hole in rawtext, tabs, trailing
     * text, the names with two spellings, the shapes the transform declines.
     * The compatibility mode deliberately breaks several of these, which is why
     * it is not measured here.
     */
    const TAB = String.fromCharCode(9);
    const CASES: [string, string][] = [
      ["statique", `<div class="box" id="x">hi</div>`],
      ["alias statique", `<div className="box" tabIndex="0">hi</div>`],
      ["booleen statique", `<input readOnly />`],
      ["href javascript statique", `<a href="javascript:alert(1)">x</a>`],
      ["style string statique", `<div style="position:fixed">x</div>`],
      ["onclick statique", `<button onclick="go()">x</button>`],
      ["titre dynamique", `<div title={s}>x</div>`],
      ["alias dynamique", `<div className={s} htmlFor={s}>x</div>`],
      ["readOnly true", `<input readOnly={yes} />`],
      ["readOnly false", `<input readOnly={no} />`],
      ["readOnly str", `<input readOnly={s} />`],
      ["readOnly vide", `<input readOnly={empty} />`],
      ["disabled zero", `<input disabled={zero} />`],
      ["value nullish", `<input value={nul} />`],
      ["href dynamique bloque", `<a href={bad}>x</a>`],
      ["style objet", `<div style={styleObj}>x</div>`],
      ["aria + data", `<div aria-hidden={s} data-x={s}>x</div>`],
      ["xlink dynamique", `<use xlinkHref={s} />`],
      ["xlink statique", `<use xlinkHref="#i" />`],
      ["xmlns", `<svg xmlnsXlink="u" />`],
      ["texte + entites", `<p>fish &amp; chips &copy; &lt;b&gt;</p>`],
      ["hole texte", `<p>{s}</p>`],
      ["deux holes", `<p>{s}{s}</p>`],
      ["tabulations", `<div>${TAB}x${TAB}</div>`],
      ["pre tabs", `<pre>${TAB}x\\n${TAB}y</pre>`],
      ["multi-ligne", `<div>  a\\n   b  </div>`],
      ["espace fermante", `<p><span>a </span><span>b</span></p>`],
      ["rawtext statique", `<style>.a &gt; .b</style>`],
      ["script statique", `<script>a &amp;&amp; b</script>`],
      ["rawtext hole", `<style>{css}</style>`],
      ["script hole", `<script>{js}</script>`],
      ["void au milieu", `<div>a<br />b</div>`],
      ["fragment", `<><li>one</li><li>two</li></>`],
      ["composant", `<div><Foo x={1} /></div>`],
      ["spread", `<div {...spread}>x</div>`],
      ["innerHTML", `<div dangerouslySetInnerHTML={{ __html: html }} />`],
      ["imbrication", `<div><span class="y">{s}</span></div>`],
      ["img void", `<img src={s} alt="a" />`],
    ];

    it("renders identically with and without the plugin, on all of them", async () => {
      const prelude = [
        `const s = "S"; const yes = true; const no = false; const empty = ""; const zero = 0;`,
        `const nul = null; const bad = "javascript:alert(1)"; const css = ".a > .b";`,
        `const js = "a && b"; const html = "<b>h</b>"; const spread = { z: 1 };`,
        `const styleObj = { color: "red", fontSize: 12 };`,
        `const Foo = (p: { x: number }) => "[Foo]";`,
      ].join("\n");
      const body = CASES.map(([, expr], i) => `export const c${i} = ${expr};`).join("\n");
      const source = `${prelude}\n${body}`;
      const id = Math.random().toString(36).slice(2);

      const runtimePath = join(TMP, `iso-rt-${id}.tsx`);
      writeFileSync(runtimePath, `/** @jsxImportSource @vincle/core */\n${source}`);
      const rtMod = (await import(runtimePath)) as Record<string, unknown>;

      const result = precompileTransform(
        source,
        "/src/app.tsx",
        { runtimeSource: RT },
        jsxAttr,
        jsxEscape,
      );
      const outputPath = join(TMP, `iso-pre-${id}.tsx`);
      writeFileSync(outputPath, `/** @jsxImportSource @vincle/core */\n${result!.code}`);
      const preMod = (await import(outputPath)) as Record<string, unknown>;

      const divergences: string[] = [];
      for (const [i, [label]] of CASES.entries()) {
        const runtime = await renderToString(rtMod[`c${i}`]);
        const precompiled = await renderToString(preMod[`c${i}`]);
        if (runtime !== precompiled) {
          divergences.push(
            `${label}\n  runtime:     ${JSON.stringify(runtime)}\n  precompiled: ${JSON.stringify(precompiled)}`,
          );
        }
      }
      expect(divergences).toEqual([]);
    });
  });

  describe("compatibility mode against Deno's own transform", () => {
    /**
     * The fixture is what Deno's `jsx: "precompile"` emitted, captured by
     * `scripts/capture-deno-trace.mjs` — so this runs without Deno installed,
     * and regenerating it is a deliberate act with a version recorded in the
     * file. A trace, not rendered HTML: every helper call in order with the
     * names chosen, since a name resolved differently is a divergence even
     * when the page looks the same.
     *
     * What the runtime then does with an identical template is the runtime's
     * promise, not this one's.
     */
    const fixture = JSON.parse(
      readFileSync(join(import.meta.dir, "../test-fixtures/deno-precompile-trace.json"), "utf8"),
    ) as {
      source: string;
      prelude: string;
      cases: { label: string; jsx: string; trace: string[] }[];
    };

    /**
     * Cases where the two transforms still differ, and why.
     *
     * Deno turns what it cannot template into a `jsx()` call; this transform
     * hands the element back as JSX for the compiler that follows. Same holes,
     * different way of filling them — and emitting `jsx()` would mean a fourth
     * helper, outside the three the precompile contract has.
     */
    const KNOWN_DIVERGENCES = new Set(["composant", "spread", "innerHTML"]);

    it("emits the same trace, apart from the shapes it hands back as JSX", async () => {
      const id = Math.random().toString(36).slice(2);
      const spyPath = join(TMP, `spy-${id}.ts`);
      writeFileSync(
        spyPath,
        [
          `export const seen: string[] = [];`,
          `export const mark = (i: number): number => (seen.push(\`— case \${i}\`), i);`,
          `export function jsxTemplate(templates: ArrayLike<string>, ...values: unknown[]): string {`,
          `  seen.push(\`tpl \${JSON.stringify([...(templates as string[])])} holes=\${values.length}\`);`,
          `  return "T";`,
          `}`,
          `export function jsxAttr(name: string, value: unknown): string {`,
          `  seen.push(\`attr \${JSON.stringify(name)}\`);`,
          `  return value == null ? "" : \`\${name}="\${String(value)}"\`;`,
          `}`,
          `export function jsxEscape(v: unknown): string {`,
          `  seen.push("escape");`,
          `  return v == null ? "" : String(v);`,
          `}`,
          `export function jsx(): string {`,
          `  seen.push("jsx");`,
          `  return "J";`,
          `}`,
          `export const Fragment = "F";`,
        ].join("\n"),
      );

      const source = [
        `import { mark } from "${spyPath}";`,
        fixture.prelude,
        ...fixture.cases.map(
          (c, i) => `export const m${i} = mark(${i});\nexport const c${i} = ${c.jsx};`,
        ),
      ].join("\n");

      const result = precompileTransform(source, "/src/app.tsx", {
        runtimeSource: spyPath,
      });
      const outputPath = join(TMP, `deno-conf-${id}.tsx`);
      writeFileSync(
        outputPath,
        `/** @jsxImportSource @vincle/core */\n${result!.code}\nexport { seen } from "${spyPath}";\n`,
      );
      const { seen } = (await import(outputPath)) as { seen: string[] };

      const byCase = new Map<number, string[]>();
      let current = -1;
      for (const line of seen) {
        const marker = /^— case (\d+)$/.exec(line);
        if (marker) {
          current = Number(marker[1]);
          byCase.set(current, []);
          continue;
        }
        byCase.get(current)?.push(line);
      }

      const diverged: string[] = [];
      fixture.cases.forEach((c, i) => {
        const ours = byCase.get(i) ?? [];
        if (JSON.stringify(ours) !== JSON.stringify(c.trace)) diverged.push(c.label);
      });

      expect(new Set(diverged)).toEqual(KNOWN_DIVERGENCES);
    });
  });

  describe("defects reproduced on purpose in compatibility mode", () => {
    // Opting in means opting into Deno's output, defects included. Each of
    // these was measured against 2.9.2 and 2.9.6.

    it("inlines a boolean attribute instead of calling jsxAttr", () => {
      // `expr ? "name" : ""`, no runtime call at all — which is how the value
      // of `readOnly={"x"}` is lost and `readOnly={""}` becomes no attribute.
      const out = transform("const a = <input readOnly={b} disabled={d} />;");
      expect(out).toContain('${(b) ? "readonly" : ""}');
      expect(out).toContain('${(d) ? "disabled" : ""}');
      expect(out).not.toContain("jsxAttr");
    });

    it("…for the list Deno inlines, and not for the ones it does not", () => {
      // `hidden`, `draggable`, `contentEditable`, `spellCheck` take a value, so
      // Deno routes them through `jsxAttr` — and so do we.
      for (const name of ["hidden", "draggable", "contentEditable", "spellCheck"]) {
        expect(transform(`const a = <div ${name}={v} />;`)).toContain("jsxAttr(");
      }
      for (const name of ["checked", "selected", "autoFocus", "formNoValidate"]) {
        expect(transform(`const a = <input ${name}={v} />;`)).not.toContain("jsxAttr(");
      }
    });

    it("precompiles a rawtext element with a hole, escaping it", () => {
      // The escape is wrong for CSS and JS — an HTML parser decodes nothing in
      // there — and it is what Deno emits. The default mode declines instead.
      const compat = transform("const a = <style>{css}</style>;");
      expect(compat).toContain("jsxTemplate`<style>${jsxEscape(css)}</style>`");

      // For the vincle dialect the element is declined: alone in a file there
      // is nothing left to rewrite, and nested it stays JSX for the runtime to
      // answer for.
      expect(
        precompileTransform(
          "const a = <style>{css}</style>;",
          "/src/app.tsx",
          { runtimeSource: RT },
          jsxAttr,
          jsxEscape,
        ),
      ).toBeNull();
      const nested = transformVincle("const a = <div><style>{css}</style></div>;");
      expect(nested).toContain("<style>{css}</style>");
      expect(nested).not.toContain("jsxEscape(css)");
    });

    it("resolves the two attribute names Deno resolves differently", () => {
      // SVG2 renamed `xlink:href` to `href`, which Deno applies; `xmlnsXlink`
      // it simply lowercases, into an attribute that does not exist.
      expect(transform('const a = <use xlinkHref="#i" />;')).toContain('href="#i"');
      expect(transform("const a = <use xlinkHref={h} />;")).toContain('jsxAttr("href", h)');
      expect(transform('const a = <svg xmlnsXlink="u" />;')).toContain('xmlnsxlink="u"');

      expect(transformVincle('const a = <use xlinkHref="#i" />;')).toContain('xlink:href="#i"');
      expect(transformVincle("const a = <use xlinkHref={h} />;")).toContain(
        'jsxAttr("xlink:href", h)',
      );
      expect(transformVincle('const a = <svg xmlnsXlink="u" />;')).toContain('xmlns:xlink="u"');
    });
  });

  describe("the name handed to the runtime", () => {
    it("is the HTML name, not the authored one", () => {
      // Remapping belongs to the transform: Deno (2.9.2 and 2.9.6) calls
      // `jsxAttr("class", …)` for `className`, static or dynamic, and a
      // runtime's own helper need not remap — Preact's does not, it remaps
      // when rendering a VNode. Passing `className` through put
      // `className="box"` in the page, styling nothing.
      const seen: string[] = [];
      const spy = (name: string, value: unknown): { value: string } => {
        seen.push(name);
        return { value: `${name}="${String(value)}"` };
      };
      precompileTransform(
        `const a = <div className="box" tabIndex="0" htmlFor="i" readOnly />;`,
        "/src/app.tsx",
        { runtimeSource: RT },
        spy,
      );
      expect(seen).toEqual(["class", "tabindex", "for", "readonly"]);
    });

    it("…and the same name reaches a dynamic hole", () => {
      const out = transform(`const a = <div className={c} htmlFor={f}>x</div>;`);
      expect(out).toContain('jsxAttr("class", c)');
      expect(out).toContain('jsxAttr("for", f)');
    });
  });

  describe("trailing text, and what each mode does with it", () => {
    // Deno's precompile right-trims the text that ends an element. Measured
    // against 2.9.2 and 2.9.6: `<span>a </span>` → `["<span>a</span>"]`, and a trailing
    // element, expression or fragment does not trigger it.
    const TAB = String.fromCharCode(9);

    it("compatibility mode right-trims the text that ends an element", () => {
      expect(transform("const a = <span>x </span>;")).toContain("`<span>x</span>`");
      expect(transform("const a = <div>  x  </div>;")).toContain("`<div>  x</div>`");
      expect(transform("const a = <div> </div>;")).toContain("`<div></div>`");
      expect(transform("const a = <script>var a = 1; </script>;")).toContain(
        "`<script>var a = 1;</script>`",
      );
      expect(transform(`const a = <div>${TAB}x${TAB}</div>;`)).toContain(`\`<div>${TAB}x</div>\``);
    });

    it("…and only for a text node in last position", () => {
      // A trailing element keeps the space in front of it, and so does a
      // trailing hole or fragment — Deno emits the same.
      expect(transform("const a = <div>x <b>y</b></div>;")).toContain("`<div>x <b>y</b></div>`");
      expect(transform("const a = <div>x {y}</div>;")).toContain("`<div>x ${");
      expect(transform("const a = <div>x <>y </></div>;")).toContain("`<div>x y </div>`");
    });

    it("the vincle dialect keeps it, like the JSX rule and the runtime path", () => {
      expect(transformVincle("const a = <span>x </span>;")).toContain("`<span>x </span>`");
      expect(transformVincle("const a = <div>  x  </div>;")).toContain("`<div>  x  </div>`");
      expect(transformVincle(`const a = <div>${TAB}x${TAB}</div>;`)).toContain(
        `\`<div>${TAB}x${TAB}</div>\``,
      );
    });
  });

  // ── Runtime integration tests ─────────────────────────────────────────────
  // These verify the transformed code actually executes and produces correct
  // HTML — the same pattern documented on /integration/precompile.
  //
  // Each test creates a custom runtime adapter (simulating the React/Hono/Preact
  // adapter from the docs), writes the transformed output to a temp file, then
  // imports and evaluates it at runtime.

  // Write test files inside the package so workspace module resolution works
  // (the package's node_modules has @vincle/core). Anchored on import.meta.dir,
  // not process.cwd(): a root-level `bun test` run would otherwise place them
  // outside the package, where "@vincle/core/*" does not resolve.
  const TMP = join(import.meta.dir, "..", `tmp/.tmp-int-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe("runtime integration — custom runtimeSource", () => {
    it("executes the precompiled output with a custom runtime adapter", async () => {
      const adapterName = `./adapter-${Math.random().toString(36).slice(2)}.ts`;
      const adapterPath = join(TMP, adapterName.slice(2));
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.ts`);

      // 1. Write the custom runtime adapter (exact pattern from docs examples)
      writeFileSync(
        adapterPath,
        [
          `export { jsxTemplate, jsxAttr, jsxEscape }`,
          `  from "@vincle/core/jsx-precompile-runtime";`,
        ].join("\n"),
      );

      // 2. Transform JSX with runtimeSource pointing to the custom adapter.
      //    `name` is in scope because we define it on the same line.
      const code = [
        `const name = "world";`,
        `export const x = <div class="hello">{name}</div>;`,
      ].join("\n");
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: adapterPath,
      });
      expect(result).not.toBeNull();
      expect(result!.code).toContain(adapterPath);

      // 3. Write the transformed code to a temp file
      writeFileSync(outputPath, result!.code);

      // 4. Import and execute the generated module
      const mod = (await import(outputPath)) as { x: { value: string } };
      expect(mod.x.value).toBe('<div class="hello">world</div>');
    });

    it("works with build-time sanitization + custom runtime", async () => {
      const adapterName = `./adapter-${Math.random().toString(36).slice(2)}.ts`;
      const adapterPath = join(TMP, adapterName.slice(2));
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.ts`);

      writeFileSync(
        adapterPath,
        [
          `export { jsxTemplate, jsxAttr, jsxEscape }`,
          `  from "@vincle/core/jsx-precompile-runtime";`,
        ].join("\n"),
      );

      const code = `export const x = <a href="javascript:alert(1)">x</a>;`;
      const result = precompileTransform(
        code,
        "/src/app.tsx",
        {
          runtimeSource: adapterPath,
        },
        jsxAttr,
      );
      expect(result).not.toBeNull();

      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as { x: { value: string } };
      expect(mod.x.value).toBe('<a href="#blocked">x</a>');
    });

    it("executes dynamic attributes with a separating space (regression: glued <divtitle=…> output)", async () => {
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.ts`);
      const code = [
        `const t = "ok";`,
        `export const x = <div title={t} class="c">hi</div>;`,
        `export const y = <input disabled={true} type="text" />;`,
      ].join("\n");
      // With `jsxAttr` injected — what the plugin does for a runtime declaring the dialect —
      // the space comes from the runtime, and the output matches the runtime
      // path byte for byte.
      const result = precompileTransform(code, "/src/app.tsx", { runtimeSource: RT }, jsxAttr);
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as {
        x: { value: string };
        y: { value: string };
      };
      expect(mod.x.value).toBe('<div title="ok" class="c">hi</div>');
      expect(mod.y.value).toBe('<input disabled type="text">');
    });

    it("an attribute the runtime drops leaves no space behind", async () => {
      // The invariant: toggling the plugin changes no byte. The transform emits
      // no separator of its own when the runtime's `jsxAttr` carries one, so a
      // dropped attribute takes its space with it.
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.tsx`);
      const runtimePath = join(TMP, `rt-${Math.random().toString(36).slice(2)}.tsx`);
      const body = [
        `const empty = null;`,
        `const off = false;`,
        `export const x = <input value={empty} />;`,
        `export const y = <input class="c" value={empty} />;`,
        `export const z = <input disabled={off} name={empty} />;`,
      ].join("\n");

      writeFileSync(runtimePath, `/** @jsxImportSource @vincle/core */\n${body}`);
      const rtMod = (await import(runtimePath)) as Record<string, unknown>;

      const result = precompileTransform(body, "/src/app.tsx", { runtimeSource: RT }, jsxAttr);
      writeFileSync(outputPath, result!.code);
      const preMod = (await import(outputPath)) as Record<string, unknown>;

      for (const key of ["x", "y", "z"]) {
        expect(await renderToString(preMod[key])).toBe(await renderToString(rtMod[key]));
      }
      expect(await renderToString(preMod["x"])).toBe("<input>");
      expect(await renderToString(preMod["y"])).toBe('<input class="c">');
    });

    it("a tab in static text survives the plugin, like every other byte", async () => {
      // `collapseJsxWhitespace` used to turn a tab into a space, which the JSX
      // compilers do not — so the same source rendered differently with the
      // plugin on, visibly inside `<pre>`.
      const TAB = String.fromCharCode(9);
      const body = [
        `export const a = <div>${TAB}x${TAB}</div>;`,
        `export const b = <pre>${TAB}x\n${TAB}y</pre>;`,
        `export const c = <div>x${TAB}y</div>;`,
      ].join("\n");
      const id = Math.random().toString(36).slice(2);

      const runtimePath = join(TMP, `rt-${id}.tsx`);
      writeFileSync(runtimePath, `/** @jsxImportSource @vincle/core */\n${body}`);
      const rtMod = (await import(runtimePath)) as Record<string, unknown>;

      const result = precompileTransform(
        body,
        "/src/app.tsx",
        { runtimeSource: RT },
        jsxAttr,
        jsxEscape,
      );
      const outputPath = join(TMP, `pre-${id}.tsx`);
      writeFileSync(outputPath, `/** @jsxImportSource @vincle/core */\n${result!.code}`);
      const preMod = (await import(outputPath)) as Record<string, unknown>;

      for (const key of ["a", "b", "c"]) {
        expect(await renderToString(preMod[key])).toBe(await renderToString(rtMod[key]));
      }
      expect(await renderToString(preMod["a"])).toBe(`<div>${TAB}x${TAB}</div>`);
    });

    it("writes the separating space into the static text, whatever the runtime", () => {
      // The precompile contract: `jsxAttr` returns `name="value"` bare, so the
      // separator is the transform's to write. Verified against the reference
      // implementation — Deno 2.9.2 and 2.9.6 emits `["<input ", ">"]` for
      // `<input value={v} />`, and Preact 10.29.7 returns `""` for a nullish
      // value, which is why that pile renders `<input >`.
      //
      // Taking the space back is the runtime's job, where the tag is being
      // assembled: `@vincle/core` does, so a template of this shape renders
      // `<div>` either way. Emitting the space unconditionally is what keeps
      // the output runnable on any runtime holding the contract.
      const emitted = (renderAttr?: typeof jsxAttr): string =>
        precompileTransform(
          `const t = "ok";\nexport const x = <div title={t}>hi</div>;`,
          "/src/app.tsx",
          { runtimeSource: RT },
          renderAttr,
        )!.code;

      expect(emitted(jsxAttr)).toContain('<div ${jsxAttr("title", t)}>');
      expect(emitted()).toContain('<div ${jsxAttr("title", t)}>');
    });

    it("routes static key/ref through jsxAttr so the runtime drops them, like Deno and the classic path", async () => {
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.ts`);
      const code = `export const x = <div key="k1" ref="r1" title="ok">hi</div>;`;
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      expect(result!.code).toContain('jsxAttr("key", "k1")');
      expect(result!.code).toContain('jsxAttr("ref", "r1")');
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as { x: { value: string } };
      // The template has Deno's shape — a space per hole in the static text —
      // and `@vincle/core` takes back the ones its dropped attributes left.
      expect(mod.x.value).toBe('<div title="ok">hi</div>');
    });

    it("wraps a precompiled child of a component in a JSX expression container (regression: literal JSXText)", async () => {
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.tsx`);
      const code = [
        `/** @jsxImportSource @vincle/core */`,
        `function Comp({ children }: { children?: unknown }) {`,
        `  return children;`,
        `}`,
        `export const x = <Comp><div>x</div></Comp>;`,
      ].join("\n");
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      expect(result!.code).toContain("<Comp>{jsxTemplate`<div>x</div>`}</Comp>");
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as { x: unknown };
      expect(await renderToString(mod.x)).toBe("<div>x</div>");
    });

    it("wraps precompiled fragments and dangerouslySetInnerHTML fallback children too", () => {
      const out1 = transform(`const x = <Comp><>hi</></Comp>;`);
      expect(out1).toContain("<Comp>{jsxTemplate`hi`}</Comp>");
      const out2 = transform(
        `const y = <div dangerouslySetInnerHTML={{ __html: h }}><span>fb</span></div>;`,
      );
      expect(out2).toContain("{jsxTemplate`<span>fb</span>`}");
      // Attribute expressions of a preserved element stay expression position.
      const out3 = transform(`const z = <Comp icon={<b>i</b>}>t</Comp>;`);
      expect(out3).toContain("icon={jsxTemplate`<b>i</b>`}");
      expect(out3).not.toContain("icon={{");
    });

    it("component children render real HTML end-to-end (regression: [object Object])", async () => {
      // The bug: the precompiled path escaped the component VNode through
      // jsxEscape → RawString("[object Object]"). The transform now leaves the
      // component element in place (Deno contract); the runtime's jsxTemplate
      // renders the VNode through the tree walk. Bun's transpiler plays the
      // role esbuild/Vite plays in the real pipeline (jsxImportSource →
      // @vincle/core/jsx-runtime).
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.tsx`);
      const code = [
        `/** @jsxImportSource @vincle/core */`,
        `const Foo = (props: { x: number }) => <b>x={props.x}</b>;`,
        `export const Page = () => <div><Foo x={1} /><span>static</span>{"dynamic"}</div>;`,
      ].join("\n");
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      // The transform must NOT escape the component element.
      expect(result!.code).not.toContain("jsxEscape(<Foo");
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as { Page: () => unknown };
      expect(await renderToString(mod.Page())).toBe(
        "<div><b>x=1</b><span>static</span>dynamic</div>",
      );
    });

    it("component holes keep document order under async rendering", async () => {
      // Sibling component holes must render sequentially: a setContext in the
      // left sibling must be visible to the right one. Rendering them with
      // Promise.all would race — the regression the ordering rule forbids.
      // `context(id)` is deterministic across module boundaries, so the test
      // can reset the same key the module writes.
      const outputPath = join(TMP, `output-${Math.random().toString(36).slice(2)}.tsx`);
      const code = [
        `/** @jsxImportSource @vincle/core */`,
        `import { context, setContext, useContext } from "@vincle/core";`,
        `const KEY = context<string>("e2e:order");`,
        `const later = <T,>(v: T, ms: number): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));`,
        `const Writer = async () => { await later(null, 5); setContext(KEY, "written"); return "w"; };`,
        `const Reader = async () => { await later(null, 1); return useContext(KEY); };`,
        `export const build = () => <div><Writer /><Reader /></div>;`,
      ].join("\n");
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as { build: () => unknown };
      const { context, setContext, withScope } = await import("@vincle/core");
      const KEY = context<string>("e2e:order");
      const results = new Set<string>();
      for (let i = 0; i < 5; i++) {
        results.add(
          await withScope(async () => {
            setContext(KEY, "initial");
            return String(await renderToString(mod.build()));
          }),
        );
      }
      expect(results.size).toBe(1);
      expect([...results][0]).toBe("<div>wwritten</div>");
    });

    it("re-export adapter produces byte-identical transform to direct @vincle/core import", () => {
      const adapterPath = join(TMP, `adapter-reexport-${Math.random().toString(36).slice(2)}.ts`);
      writeFileSync(
        adapterPath,
        [
          `export { jsxTemplate, jsxAttr, jsxEscape }`,
          `  from "@vincle/core/jsx-precompile-runtime";`,
        ].join("\n"),
      );

      const code = `const x = <div class="hello">{name}</div>;`;
      const fromDirect = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      })!.code;
      const fromAdapter = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: adapterPath,
      })!.code;

      const stripPath = (s: string) =>
        s.replace(/".*jsx(-precompile)?-runtime"/, "SRC").replace(/".*adapter-.*\.ts"/, "SRC");
      expect(stripPath(fromDirect)).toBe(stripPath(fromAdapter));
    });

    it("entities: precompiled output is byte-identical to the dynamic runtime path", async () => {
      // The invariant that matters (I-04): toggling the plugin on/off must never
      // change output. The runtime file lets Bun compile the JSX with the
      // automatic runtime (its own entity decoding); the precompiled file uses
      // our decode + escapeContent. Both must land on the same bytes.
      const body = `<div>Tom &amp; Jerry &lt;b&gt; &copy; &mdash; &#169; &#x27; fish & chips &notreal;</div>`;
      const rand = () => Math.random().toString(36).slice(2);

      const runtimePath = join(TMP, `rt-${rand()}.tsx`);
      writeFileSync(
        runtimePath,
        `/** @jsxImportSource @vincle/core */\nexport const html = ${body};`,
      );
      const rtMod = (await import(runtimePath)) as { html: { value: string } };

      const preSrc = precompileTransform(`export const html = ${body};`, "/src/app.tsx", {
        runtimeSource: RT,
      })!.code;
      const prePath = join(TMP, `pre-${rand()}.ts`);
      writeFileSync(prePath, preSrc);
      const preMod = (await import(prePath)) as { html: { value: string } };

      expect(preMod.html.value).toBe(rtMod.html.value);
    });

    it("rawtext: a static <style> stays precompiled, byte-identical to the runtime path", async () => {
      const rand = () => Math.random().toString(36).slice(2);
      const body = `<style>.a &gt; .b, .c:not(.d)</style>`;

      const runtimePath = join(TMP, `rt-${rand()}.tsx`);
      writeFileSync(
        runtimePath,
        `/** @jsxImportSource @vincle/core */\nexport const html = ${body};`,
      );
      const rtMod = (await import(runtimePath)) as { html: { value: string } };

      const preSrc = precompileTransform(
        `export const html = ${body};`,
        "/src/app.tsx",
        {
          runtimeSource: RT,
        },
        jsxAttr,
      )!.code;
      expect(preSrc).toContain("jsxTemplate");
      const prePath = join(TMP, `pre-${rand()}.ts`);
      writeFileSync(prePath, preSrc);
      const preMod = (await import(prePath)) as { html: { value: string } };

      expect(preMod.html.value).toBe(rtMod.html.value);
    });

    it("rawtext: a <style> with a dynamic hole is handed to the runtime, not templated", async () => {
      // Escaping a hole for HTML inside rawtext is wrong (a parser decodes
      // nothing there), and escaping it correctly would take a helper the
      // precompile contract does not have. So the element is left as JSX and its
      // own runtime applies its own rule — which is also why the output must
      // still compile against a runtime that is not vincle.
      const out = precompileTransform(
        `const css = ".a{color:red}";\nexport const html = <div><style>{css}</style></div>;`,
        "/src/app.tsx",
        { runtimeSource: RT },
        jsxAttr,
      );

      expect(out!.code).not.toContain("jsxEscape(css)");
      expect(out!.code).toContain("<style>{css}</style>");
      expect(importedHelpers(out!.code)).toEqual(["jsxTemplate"]);
    });
  });

  // ── React alias vs native name, on one element ────────────────────────────

  describe("an alias and its HTML name on the same element", () => {
    // Both spellings type-check (`VincleOverrides` declares `class` and
    // `className`), so this is reachable. The runtime resolves it — the native
    // name wins — and emitting both let the parser resolve it instead, the other
    // way round: it keeps the *first* attribute.
    const emit = (code: string): string =>
      precompileTransform(code, "/src/app.tsx", { runtimeSource: RT }, jsxAttr)!.code;

    it("keeps the native name, whichever order they are written in", () => {
      expect(emit('export const a = <div className="a" class="b">x</div>;')).toContain(
        '<div class="b">',
      );
      expect(emit('export const a = <div class="b" className="a">x</div>;')).toContain(
        '<div class="b">',
      );
    });

    it("drops the alias even when its value is dynamic", () => {
      const out = emit('export const a = <div className={x} class="b">y</div>;');
      expect(out).toContain('<div class="b">');
      expect(out).not.toContain("jsxAttr");
    });

    it("agrees with the runtime's own answer", async () => {
      // The same props through the runtime — this is the byte the template has
      // to match, and it is the reason the rule is "native wins" and not
      // "first wins".
      expect(await renderToString(jsx("div", { className: "a", class: "b", children: "x" }))).toBe(
        '<div class="b">x</div>',
      );
      expect(await renderToString(jsx("label", { htmlFor: "i", for: "j", children: "x" }))).toBe(
        '<label for="j">x</label>',
      );
    });

    it("leaves a lone alias alone", () => {
      expect(emit('export const a = <div className="only">x</div>;')).toContain(
        '<div class="only">',
      );
      expect(emit('export const a = <label htmlFor="i">x</label>;')).toContain('<label for="i">');
    });
  });

  // ── The precompile contract, as the only thing the output may import ──────

  /**
   * `jsxTemplate`, `jsxAttr` and `jsxEscape` — the three helpers Deno's
   * precompile defined and Preact and Hono also export. A generated call to
   * anything else is not a wrong byte, it is a missing import: the build breaks,
   * and only for the runtime that lacks it.
   *
   * This is the check that was missing when a fourth helper was added for
   * rawtext holes: every unit test passed the runtime source explicitly, and the
   * one module that has to re-export the set — the plugin's virtual module — was
   * not in the loop.
   */
  const CONTRACT = new Set(["jsxAttr", "jsxEscape", "jsxTemplate"]);

  describe("a runtime that answers outside the contract", () => {
    // The transform accepts whatever shape a runtime's helper returns — a plain
    // string (Deno, Preact) or a `RawString` (@vincle/core). Anything else has
    // to name itself: this message is the only thing standing between a broken
    // runtime and an attribute serialized as `undefined` into a start tag.
    const code = `export const x = <div title="hi">hello</div>;`;

    it("names jsxAttr and the attribute when the shape is unknown", () => {
      const bogus = (() => 42) as unknown as Parameters<typeof precompileTransform>[3];
      expect(() => precompileTransform(code, "/src/app.tsx", { runtimeSource: RT }, bogus)).toThrow(
        /jsxAttr returned neither a string nor a \{ value: string \}.*"title".*number/s,
      );
    });

    it("says a Promise is a Promise, rather than reporting the wrong cause", () => {
      const pending = (async () => 'title="hi"') as unknown as Parameters<
        typeof precompileTransform
      >[3];
      expect(() =>
        precompileTransform(code, "/src/app.tsx", { runtimeSource: RT }, pending),
      ).toThrow(/jsxAttr returned a Promise for the static value "title"/);
    });
  });

  describe("the generated code imports only the precompile contract", () => {
    const cases: Record<string, string> = {
      "rawtext hole": "export const a = <div><style>{css}</style></div>;",
      "rawtext static": "export const a = <style>.x{'{'}color:red{'}'}</style>;",
      "script hole": "export const a = <div><script>{code}</script></div>;",
      "void with content": "export const a = <div><img>{alt}</img></div>;",
      "void bare": 'export const a = <div><img src="/a.png" /></div>;',
      "dynamic attribute": "export const a = <a href={url}>x</a>;",
      "dynamic child": "export const a = <p>{name}</p>;",
      "component child": "export const a = <p><Comp /></p>;",
      fragment: "export const a = <>{one}<b>two</b></>;",
      "array child": "export const a = <ul>{items.map((i) => <li>{i}</li>)}</ul>;",
    };

    for (const [name, code] of Object.entries(cases)) {
      it(`${name}: no helper outside the contract`, () => {
        for (const compatibility of [true, false]) {
          const out = precompileTransform(
            code,
            "/src/app.tsx",
            { runtimeSource: RT, compatibility },
            jsxAttr,
          );
          if (!out) continue;
          const outside = importedHelpers(out.code).filter((h) => !CONTRACT.has(h));
          expect(outside, `compatibility: ${compatibility}`).toEqual([]);
        }
      });
    }
  });
});

/** The named imports the transform injected, sorted. */
function importedHelpers(code: string): string[] {
  const names = new Set<string>();
  for (const m of code.matchAll(/import \{([^}]*)\} from/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim();
      if (name) names.add(name);
    }
  }
  return [...names].toSorted();
}
