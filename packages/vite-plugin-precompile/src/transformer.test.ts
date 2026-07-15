import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { jsxAttr, jsxEscape } from "@vincle/core/jsx-runtime";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import precompileTransform from "./transformer.js";

const RT = "@vincle/core/jsx-runtime";

function transform(code: string, id = "/src/app.tsx"): string {
  const result = precompileTransform(code, id, { runtimeSource: RT });
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

  it("wraps component children in jsxEscape", () => {
    const out = transform(`const a = <div><Foo x={1} /></div>;`);
    expect(out).toContain("${jsxEscape(<Foo x={1} />)}");
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

  describe("secure mode", () => {
    function transformSecure(code: string): string {
      const result = precompileTransform(
        code,
        "/src/app.tsx",
        { runtimeSource: RT, secure: true },
        jsxAttr,
      );
      if (!result) throw new Error("expected a transform result, got null");
      return result.code;
    }

    function transformSecureWithEscape(code: string): string {
      const result = precompileTransform(
        code,
        "/src/app.tsx",
        { runtimeSource: RT, secure: true },
        jsxAttr,
        jsxEscape,
      );
      if (!result) throw new Error("expected a transform result, got null");
      return result.code;
    }

    it("sanitizes static URL attributes at build time (output stays static)", () => {
      const out = transformSecure(`const a = <a href="javascript:alert(1)">x</a>;`);
      expect(out).toContain('<a href="#blocked">x</a>');
      expect(out).not.toContain("jsxAttr"); // sanitized at build time, not at runtime
      expect(out).not.toContain("javascript:");
    });

    it("keeps safe URLs intact and still remaps names", () => {
      const out = transformSecure(`const a = <a href="/path" className="link">x</a>;`);
      expect(out).toContain('<a href="/path" class="link">x</a>');
    });

    it("passes through style values (CSS safety is deferred to the runtime)", () => {
      const out = transformSecure(
        `const a = <div style="background:url(javascript:alert(1))">x</div>;`,
      );
      expect(out).toContain("javascript:");
    });

    it("escapes static values through the runtime", () => {
      const out = transformSecure(`const a = <div title='a"b'>x</div>;`);
      expect(out).toContain("a&quot;b");
    });

    it("escapes static text content using the runtime's own jsxEscape", () => {
      const out = transformSecureWithEscape(`const a = <div>hello & world</div>;`);
      // jsxEscape from @vincle/core escapes & < > — same as escapeContent
      // for Vincle. For other runtimes (Preact, Hono) the escaping differs;
      // using the runtime's own jsxEscape guarantees byte-identity.
      expect(out).toContain("jsxTemplate`<div>hello &amp; world</div>`");
    });

    it("decodes rawtext entities then escapeRawText (secure mode, matches dynamic runtime)", () => {
      // Secure mode: decode entities (like the JS compiler does) then
      // escapeRawText — the same path renderChild takes — so `&gt;` becomes
      // a real `>` and the output is valid CSS/JS. Unlike Deno mode where
      // rawtext entities stay verbatim.
      const style = transformSecure("const a = <style>.a &gt; .b</style>;");
      expect(style).toContain("jsxTemplate`<style>.a > .b</style>`");
      const script = transformSecure("const a = <script>a &amp;&amp; b</script>;");
      expect(script).toContain("jsxTemplate`<script>a && b</script>`");
      // The element's own closing tag is neutralized (breakout guard).
      const guard = transformSecure("const a = <script>x &lt;/script&gt; y</script>;");
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
      const out = transform('const a = <use xlink:href="#i" />;');
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
      expect(out).toContain("jsxTemplate`<div>&lt;script>alert(1)&lt;/script></div>`");

      expect(out).not.toContain("<script>");
    });

    it("keeps rawtext entities verbatim (Deno-compatible mode)", () => {
      // Deno mode (secure: false): rawtext entities stay literal — the HTML
      // parser never decodes entities in <script>/<style> content, so keeping
      // them verbatim is safe and matches Deno's own precompile output.
      const style = transform("const a = <style>.a &gt; .b</style>;");
      expect(style).toContain("jsxTemplate`<style>.a &gt; .b</style>`");
      const script = transform("const a = <script>a &amp;&amp; b</script>;");
      expect(script).toContain("jsxTemplate`<script>a &amp;&amp; b</script>`");
      // </script> encoded as entities stays safe — browser won't decode
      // entities in rawtext, so no breakout.
      const guard = transform("const a = <script>x &lt;/script&gt; y</script>;");
      expect(guard).toContain("&lt;/script&gt;");
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

    it("works with secure mode + custom runtime", async () => {
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
          secure: true,
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
      const result = precompileTransform(code, "/src/app.tsx", {
        runtimeSource: RT,
      });
      writeFileSync(outputPath, result!.code);
      const mod = (await import(outputPath)) as {
        x: { value: string };
        y: { value: string };
      };
      expect(mod.x.value).toBe('<div title="ok" class="c">hi</div>');
      expect(mod.y.value).toBe('<input disabled type="text">');
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
      // Dropped attributes leave residual spaces — same shape as Deno's output.
      expect(mod.x.value).toBe('<div   title="ok">hi</div>');
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
      const mod = (await import(outputPath)) as { x: { value: string } };
      expect(mod.x.value).toBe("<div>x</div>");
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

    it("rawtext: precompiled <style> is byte-identical to the dynamic runtime path (secure mode)", async () => {
      const rand = () => Math.random().toString(36).slice(2);
      const body = `<style>.a &gt; .b {"{"}color:red{"}"}</style>`;

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
          secure: true,
        },
        jsxAttr,
      )!.code;
      const prePath = join(TMP, `pre-${rand()}.ts`);
      writeFileSync(prePath, preSrc);
      const preMod = (await import(prePath)) as { html: { value: string } };

      expect(preMod.html.value).toBe(rtMod.html.value);
    });
  });
});
