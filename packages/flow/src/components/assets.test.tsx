import { renderToString, withScope } from "@vincle/core";
import { useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { Flow, initFlow, type FlowContext } from "../context.js";
import { Style, Script } from "./assets.js";

function strictFlow(): FlowContext {
  return useContext(Flow);
}

/** Every test needs a scope with a Flow context; this is the only setup. */
const inFlow = <T,>(fn: () => Promise<T>): Promise<T> =>
  withScope(async () => {
    initFlow({ adapter: TurboAdapter, mode: "streaming" });
    return fn();
  });

describe("Style", () => {
  it("emits its tag at its own position", async () => {
    await inFlow(async () => {
      const html = await renderToString(<Style name="ec/base">{"body { color: red }"}</Style>);
      expect(html).toBe('<style data-name="ec/base">body { color: red }</style>');
    });
  });

  it("registers the declaration, for the duplicate-attributes warning", async () => {
    await inFlow(async () => {
      await renderToString(<Style name="ec/base">{"body { color: red }"}</Style>);
      const { assets } = strictFlow();
      expect(assets.entries.get("ec/base")?.type).toBe("style");
    });
  });

  it("accepts a factory, and awaits it", async () => {
    await inFlow(async () => {
      const html = await renderToString(<Style name="ec/theme">{async () => ".theme { }"}</Style>);
      expect(html).toBe('<style data-name="ec/theme">.theme { }</style>');
    });
  });

  it("carries the media attribute", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <Style name="print" media="print">
          {".no-print { display: none }"}
        </Style>,
      );
      expect(html).toBe(
        '<style data-name="print" media="print">.no-print { display: none }</style>',
      );
    });
  });

  // The name used to be interpolated into an HTML comment, so `-->` in it was an
  // error. There is no comment any more: the name goes into an attribute, which
  // the engine escapes. The guard was removed with the mechanism it guarded.
  it("accepts a name that would have broken the old comment marker", async () => {
    await inFlow(async () => {
      const html = await renderToString(<Style name={"x-->dangerous"}>{".a { }"}</Style>);
      expect(html).toBe('<style data-name="x-->dangerous">.a { }</style>');
    });
  });

  it("escapes content that would close the element", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <Style name="evil">{"</style><script>alert(1)</script>"}</Style>,
      );
      expect(html).toContain("<\\/style");
      expect(html).not.toContain("</style><script>");
    });
  });
});

describe("Script", () => {
  it("emits its tag, with module and awaited factory content", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <Script name="ec/init" module>
          {() => "console.log('init')"}
        </Script>,
      );
      expect(html).toBe('<script data-name="ec/init" type="module">console.log(\'init\')</script>');
    });
  });

  it("carries defer as a boolean attribute", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <Script name="late" defer>
          {"/* deferred */"}
        </Script>,
      );
      expect(html).toBe('<script data-name="late" defer>/* deferred */</script>');
    });
  });

  it("renders src with an empty body when there is no content", async () => {
    await inFlow(async () => {
      const html = await renderToString(<Script name="jquery" src="/vendor/jquery.js" />);
      expect(html).toBe('<script data-name="jquery" src="/vendor/jquery.js"></script>');
    });
  });

  it("keeps real JavaScript readable — no entity escaping", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <Script name="cmp">{async () => "if (a < b && c > d) { go() }"}</Script>,
      );
      expect(html).toBe('<script data-name="cmp">if (a < b && c > d) { go() }</script>');
    });
  });
});

describe("deduplication happens at render time, in document order", () => {
  it("the first occurrence emits, the later ones render nothing", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <div>
          <Style name="dup">{".first { }"}</Style>
          <p>between</p>
          <Style name="dup">{".second { }"}</Style>
        </div>,
      );
      expect(html).toBe('<div><style data-name="dup">.first { }</style><p>between</p></div>');
    });
  });

  it("a later occurrence never evaluates its factory", async () => {
    await inFlow(async () => {
      let evaluated = 0;
      const factory = () => {
        evaluated++;
        return ".x { }";
      };
      await renderToString(
        <div>
          <Style name="once">{factory}</Style>
          <Style name="once">{factory}</Style>
        </div>,
      );
      expect(evaluated).toBe(1);
    });
  });

  it("different names are independent", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <div>
          <Style name="a">{".a { }"}</Style>
          <Style name="b">{".b { }"}</Style>
        </div>,
      );
      expect(html).toBe(
        '<div><style data-name="a">.a { }</style><style data-name="b">.b { }</style></div>',
      );
    });
  });

  // The reason the post-render pass could be removed: the walk already runs
  // components in markup order, so "first occurrence" needs no re-derivation —
  // even when the first one is async and the second is not.
  it("document order holds when the first occurrence is async", async () => {
    await inFlow(async () => {
      const html = await renderToString(
        <div>
          <Style name="slow">
            {async () => {
              await new Promise((r) => setTimeout(r, 5));
              return ".slow { }";
            }}
          </Style>
          <Style name="slow">{".fast { }"}</Style>
        </div>,
      );
      expect(html).toBe('<div><style data-name="slow">.slow { }</style></div>');
    });
  });
});
