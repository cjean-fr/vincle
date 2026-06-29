import precompileTransform from "./transformer.js";
import { jsxAttr } from "@vincle/core/jsx-runtime";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { describe, it, expect } from "bun:test";

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

  it("escapes dynamic children with jsxEscape", () => {
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
    const out = transform(
      `const a = <div>{cond ? <span>a</span> : <b>b</b>}</div>;`,
    );
    expect(out).toContain(
      "cond ? jsxTemplate`<span>a</span>` : jsxTemplate`<b>b</b>`",
    );
  });

  it("precompiles JSX returned from a .map() callback", () => {
    const out = transform(
      `const a = <ul>{items.map((i) => <li>{i}</li>)}</ul>;`,
    );
    expect(out).toContain(
      "items.map((i) => jsxTemplate`<li>${jsxEscape(i)}</li>`)",
    );
  });

  it("flattens fragments into the parent template", () => {
    const out = transform(`const a = <><li>one</li><li>two</li></>;`);
    expect(out).toContain("jsxTemplate`<li>one</li><li>two</li>`");
  });

  it("leaves component children as JSX for the downstream transform", () => {
    const out = transform(`const a = <div><Foo x={1} /></div>;`);
    expect(out).toContain("${<Foo x={1} />}");
  });

  it("does not emit a closing tag for void elements", () => {
    expect(transform(`const a = <input disabled />;`)).toContain(
      "jsxTemplate`<input disabled>`",
    );
    expect(transform(`const a = <input value={v} />;`)).toContain(
      '${jsxAttr("value", v)}>`',
    );
    expect(transform(`const a = <input value={v} />;`)).not.toContain(
      "</input>",
    );
  });

  it("does not emit a closing tag for dynamic void elements nested in a parent", () => {
    const out = transform(`const a = <div><img src={s} alt="x" /></div>;`);
    expect(out).toContain('<div><img${jsxAttr("src", s)} alt="x"></div>');
    expect(out).not.toContain("</img>");
  });

  it("escapes static literal attribute values", () => {
    expect(transform(`const a = <div title='a"b'>x</div>;`)).toContain(
      'title="a&quot;b"',
    );
    expect(transform(`const a = <div data-x="a&b<c">x</div>;`)).toContain(
      'data-x="a&amp;b&lt;c"',
    );
  });

  it("does not over-escape clean attribute values", () => {
    expect(
      transform(`const a = <a title="go now" class="link">go</a>;`),
    ).toContain('<a title="go now" class="link">go</a>');
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
    expect(
      transform(`const a = <div><span class="y">deep</span></div>;`),
    ).toContain('jsxTemplate`<div><span class="y">deep</span></div>`');
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
    expect(transform(`const a = <div className="box">x</div>;`)).not.toContain(
      "jsxAttr",
    );
  });

  it("remaps camelCase boolean attribute names too", () => {
    expect(transform(`const a = <input readOnly />;`)).toContain(
      "jsxTemplate`<input readonly>`",
    );
  });

  it("lowercases event-handler names and inlines them (Deno-aligned)", () => {
    expect(transform(`const a = <button onClick="go()">x</button>;`)).toContain(
      '<button onclick="go()">x</button>',
    );
  });

  it("inlines URL and style attributes verbatim by default (trusted)", () => {
    expect(
      transform(`const a = <a href="javascript:alert(1)">x</a>;`),
    ).toContain('<a href="javascript:alert(1)">x</a>');
    expect(transform(`const a = <div style="color:red">x</div>;`)).toContain(
      '<div style="color:red">x</div>',
    );
    expect(transform(`const a = <img srcSet="a.png 1x" />;`)).toContain(
      '<img srcset="a.png 1x">',
    );
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

    it("sanitizes static URL attributes at build time (output stays static)", () => {
      const out = transformSecure(
        `const a = <a href="javascript:alert(1)">x</a>;`,
      );
      expect(out).toContain('<a href="#blocked">x</a>');
      expect(out).not.toContain("jsxAttr"); // sanitized at build time, not at runtime
      expect(out).not.toContain("javascript:");
    });

    it("keeps safe URLs intact and still remaps names", () => {
      const out = transformSecure(
        `const a = <a href="/path" className="link">x</a>;`,
      );
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
      precompileTransform(
        `const a = <div {...props} id="x" />;`,
        "/src/app.tsx",
        {
          runtimeSource: RT,
        },
      ),
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
      if (!result?.map)
        throw new Error("expected a transform result with a map");
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
      const result = precompileTransform(
        `const a = <div>{name}</div>;`,
        "/src/app.tsx",
        {
          runtimeSource: RT,
        },
      )!;
      expect(result.map).toBeDefined();
      expect(result.map!.mappings.length).toBeGreaterThan(0);
    });

    it("maps a dynamic expression back to its source line when the import is prepended", () => {
      // The injected import shifts every line down by one — the map must
      // describe the final code, not the pre-injection code (regression).
      const code = [
        `const before = 1;`,
        `const a = <div>{userName}</div>;`,
      ].join("\n");
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
      expect(() =>
        new Bun.Transpiler({ loader: "ts" }).transformSync(out),
      ).not.toThrow();
    });

    it("escapes backticks in static attribute values", () => {
      const out = transform("const a = <div title='a`b'>x</div>;");
      expect(out).toContain('title="a\\`b"');
      expect(() =>
        new Bun.Transpiler({ loader: "ts" }).transformSync(out),
      ).not.toThrow();
    });

    it("serializes namespaced static attributes (xlink:href)", () => {
      const out = transform('const a = <use xlink:href="#i" />;');
      expect(out).toContain('xlink:href="#i"');
      expect(out).not.toContain("[object Object]");
    });

    it("HTML-escapes bare ampersands in static text but keeps entities", () => {
      const out = transform("const a = <div>fish & chips &amp; &copy;</div>;");
      expect(out).toContain(
        "jsxTemplate`<div>fish &amp; chips &amp; &copy;</div>`",
      );
    });
  });
});
