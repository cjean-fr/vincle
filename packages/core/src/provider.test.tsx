/** @jsxImportSource @vincle/core */
import { describe, expect, test } from "bun:test";

import {
  jsx,
  jsxEscape,
  jsxEscapeDeferred,
  jsxTemplate,
  jsxTemplateDeferred,
} from "./jsx-runtime.js";
import { createContext, SyncTreeStore, useContext } from "./provider.js";
import { renderToString } from "./render.js";
import { Scope } from "./scope.js";
import { RawString } from "./types.js";

const Locale = createContext("fr");
const Reader = () => <b>{useContext(Locale)}</b>;

describe("tree context", () => {
  test("synchronous fallback nests, allows one in-flight render, and refuses a second", async () => {
    const fallback = new SyncTreeStore();
    const token = createContext<unknown>("default");
    const outer = { context: token, value: "outer", parent: undefined };
    expect(
      fallback.run(outer, () => {
        const inside = fallback.run(
          { context: token, value: "inner", parent: fallback.getStore() },
          () => fallback.getStore()?.value,
        );
        expect(inside).toBe("inner");
        expect(fallback.getStore()?.value).toBe("outer");
        expect(() =>
          fallback.run({ context: token, value: "bad", parent: fallback.getStore() }, () => {
            throw new Error("failed");
          }),
        ).toThrow("failed");
        expect(fallback.getStore()?.value).toBe("outer");
        return fallback.getStore()?.value;
      }),
    ).toBe("outer");
    expect(fallback.getStore()).toBeUndefined();

    // One render may be in flight — even async: its frame stays installed until
    // it settles, and a second render is refused rather than leaking.
    const pending = fallback.run(
      { context: token, value: "in-flight", parent: fallback.getStore() },
      () => Promise.resolve("later"),
    );
    expect(fallback.getStore()?.value).toBe("in-flight");
    expect(() =>
      fallback.run({ context: token, value: "second", parent: fallback.getStore() }, () => "x"),
    ).toThrow("no AsyncLocalStorage");
    await pending;
    expect(fallback.getStore()).toBeUndefined();
    expect(
      fallback.run(
        { context: token, value: "again", parent: undefined },
        () => fallback.getStore()?.value,
      ),
    ).toBe("again");
  });
  test("default, nearest Provider and later siblings", async () => {
    expect(useContext(Locale)).toBe("fr");
    const html = await renderToString(
      <main>
        <Reader />
        <Locale.Provider value="en">
          <Reader />
          <Locale.Provider value="de">
            <Reader />
          </Locale.Provider>
          <Reader />
        </Locale.Provider>
        <Reader />
      </main>,
    );
    expect(html).toBe("<main><b>fr</b><b>en</b><b>de</b><b>en</b><b>fr</b></main>");
  });

  test("the context is its own Provider, as in React 19", async () => {
    expect(Locale.Provider).toBe(Locale);
    expect(await renderToString(jsx(Locale, { value: "en", children: jsx(Reader, {}) }))).toBe(
      "<b>en</b>",
    );
    expect(
      await renderToString(
        <Locale.Provider value="en">
          <Reader />
        </Locale.Provider>,
      ),
    ).toBe("<b>en</b>");
  });

  test("Consumer reads the nearest Provider, or the default outside one", async () => {
    const read = (value: unknown) => <b>{"c=" + value}</b>;
    expect(await renderToString(<Locale.Consumer>{read}</Locale.Consumer>)).toBe("<b>c=fr</b>");
    expect(
      await renderToString(
        <Locale.Provider value="en">
          <Locale.Consumer>{read}</Locale.Consumer>
        </Locale.Provider>,
      ),
    ).toBe("<b>c=en</b>");
    expect(
      await renderToString(
        <Locale.Provider value="en">
          <Locale.Provider value="de">
            <Locale.Consumer>{read}</Locale.Consumer>
          </Locale.Provider>
        </Locale.Provider>,
      ),
    ).toBe("<b>c=de</b>");
  });

  test("Consumer renders whatever its function returns", async () => {
    expect(
      await renderToString(
        <Locale.Provider value="en">
          <Locale.Consumer>
            {() => (
              <main>
                <Reader />
              </main>
            )}
          </Locale.Consumer>
        </Locale.Provider>,
      ),
    ).toBe("<main><b>en</b></main>");
  });

  test("a Consumer without a function child throws a named error", async () => {
    // The untyped door only: a JSX child here is checked against the function
    // prop, so the runtime refusal is reached through `jsx` with raw attrs.
    await expect(renderToString(jsx(Locale.Consumer, { children: "nope" }))).rejects.toThrow(
      "not a function",
    );
    await expect(
      renderToString(jsx(Locale, { value: "en", children: jsx(Locale.Consumer, {}) })),
    ).rejects.toMatchObject({ code: "ERR_VINCLE_CONTEXT_CHILDREN" });
  });

  test("the public surface matches React 19: no defaultValue property", async () => {
    expect(Object.keys(Locale)).toEqual(["Provider", "Consumer"]);
    expect("defaultValue" in Locale).toBe(false);
    expect(await renderToString(<Reader />)).toBe("<b>fr</b>");
  });

  test("async readers and concurrent roots stay isolated", async () => {
    const AsyncReader = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return <Reader />;
    };
    const render = (value: string) =>
      renderToString(
        <Locale.Provider value={value}>
          <AsyncReader />
        </Locale.Provider>,
      );
    expect(await Promise.all([render("a"), render("b")])).toEqual(["<b>a</b>", "<b>b</b>"]);
    expect(useContext(Locale)).toBe("fr");
  });

  test("errors unwind and execution context remains separate", async () => {
    const Key = Scope.key<string>("tree-separation");
    const Fail = async () => {
      await Promise.resolve();
      expect(Scope.get(Key)).toBe("execution");
      expect(useContext(Locale)).toBe("en");
      throw new Error("failed");
    };
    await Scope.with(async () => {
      Scope.set(Key, "execution");
      await expect(
        renderToString(
          <Locale.Provider value="en">
            <Fail />
          </Locale.Provider>,
        ),
      ).rejects.toThrow("failed");
      expect(Scope.get(Key)).toBe("execution");
      expect(useContext(Locale)).toBe("fr");
      expect(await renderToString(<Reader />)).toBe("<b>fr</b>");
    });
  });

  test("a synchronous component error leaves later renders on the default", async () => {
    const Fail = () => {
      throw new Error("sync failure");
    };
    await expect(
      renderToString(
        <Locale.Provider value="en">
          <Fail />
        </Locale.Provider>,
      ),
    ).rejects.toThrow("sync failure");
    expect(await renderToString(<Reader />)).toBe("<b>fr</b>");
  });

  test("precompiled component holes render under the Provider", async () => {
    const compiled = jsxTemplateDeferred`<section><i>static</i>${jsx(Reader, {})}</section>`;
    expect(await renderToString(jsx(Locale.Provider, { value: "en", children: compiled }))).toBe(
      "<section><i>static</i><b>en</b></section>",
    );
    expect(jsxTemplate`<section><i>static</i></section>`).toBeInstanceOf(RawString);
    const nested = jsxTemplateDeferred`<span>${jsx(Reader, {})}</span>`;
    const outer = jsxTemplateDeferred`<div>${/* transformed JSX expression */ jsxEscapeDeferred(nested)}</div>`;
    expect(await renderToString(jsx(Locale.Provider, { value: "de", children: outer }))).toBe(
      "<div><span><b>de</b></span></div>",
    );
    expect(
      await renderToString(
        <Locale.Provider value="it">
          <div>{nested}</div>
        </Locale.Provider>,
      ),
    ).toBe("<div><span><b>it</b></span></div>");
    const ScriptValue = () => useContext(Locale);
    const rawtext = jsxTemplateDeferred`<main>${jsx("script", { children: jsx(ScriptValue, {}) })}</main>`;
    expect(await renderToString(jsx(Locale.Provider, { value: "en", children: rawtext }))).toBe(
      "<main><script>en</script></main>",
    );
  });

  test("Deno precompile helpers preserve Provider context", async () => {
    const direct = jsx(Locale.Provider, {
      value: "en",
      children: jsxTemplate`<section>${jsx(Reader, {})}</section>`,
    });
    expect(await renderToString(direct)).toBe("<section><b>en</b></section>");

    const mapped = jsx(Locale.Provider, {
      value: "de",
      children: jsxTemplate`<ul>${jsxEscape([jsx(Reader, {}), jsx(Reader, {})])}</ul>`,
    });
    expect(await renderToString(mapped)).toBe("<ul><b>de</b><b>de</b></ul>");

    const value = { toString: () => useContext(Locale) };
    const coerced = jsx(Locale.Provider, {
      value: "it",
      children: jsxTemplate`<p>${jsxEscape(value)}</p>`,
    });
    expect(await renderToString(coerced)).toBe("<p>it</p>");
  });

  test("a Provider inside rawtext keeps its value and escapes the closing tag", async () => {
    const ScriptValue = () => `${useContext(Locale)}</script>`;
    const html = await renderToString(
      <script>
        <Locale.Provider value="en">
          <ScriptValue />
        </Locale.Provider>
      </script>,
    );
    expect(html).toBe("<script>en\\u003c/script></script>");
  });

  test("coercible objects wait for their Provider in compiled templates", async () => {
    const Before = () => <b>x</b>;
    const value = { toString: () => useContext(Locale) };
    for (const child of [value, [value]]) {
      const ordinary = jsx(Locale.Provider, {
        value: "en",
        children: jsx("div", { children: [jsx(Before, {}), child] }),
      });
      const compiled = jsx(Locale.Provider, {
        value: "en",
        children: jsxTemplateDeferred`<div>${jsx(Before, {})}${jsxEscapeDeferred(child)}</div>`,
      });
      expect(await renderToString(compiled)).toBe(await renderToString(ordinary));
      expect(await renderToString(compiled)).toBe("<div><b>x</b>en</div>");
    }
  });
});
