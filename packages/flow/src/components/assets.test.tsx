import { renderToString, withScope } from "@vincle/core";
import { useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { resolveAssets } from "../assets.js";
import { Flow, initFlow, type FlowContext } from "../context.js";
import { Style, Script } from "./assets.js";

function strictFlow(): FlowContext {
  return useContext(Flow);
}

describe("Style", () => {
  it("emits a marker and registers content", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<Style name="ec/base">{"body { color: red }"}</Style>);
      expect(html).toBe("<!-- vincle:style:ec/base -->");
      const { assets } = strictFlow();
      expect(assets.entries.has("ec/base")).toBe(true);
      expect(assets.entries.get("ec/base")?.type).toBe("style");
    });
  });

  it("accepts a factory function", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(<Style name="ec/theme">{() => ".theme { }"}</Style>);
      const { assets } = strictFlow();
      const entry = assets.entries.get("ec/theme");
      expect(entry).toBeDefined();
      expect(typeof entry!.content).toBe("function");
    });
  });

  it("stores media attribute", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(
        <Style name="print" media="print">
          {".no-print { display: none }"}
        </Style>,
      );
      const { assets } = strictFlow();
      expect(assets.entries.get("print")?.attrs).toEqual({ media: "print" });
    });
  });

  it("throws for unsafe names containing -->", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      expect(() => renderToString(<Style name={"x-->dangerous"}>{".a { }"}</Style>)).toThrow();
    });
  });
});

describe("Script", () => {
  it("emits a marker and registers content", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Script name="ec/init" module>
          {() => "console.log('init')"}
        </Script>,
      );
      expect(html).toBe("<!-- vincle:script:ec/init -->");
      const { assets } = strictFlow();
      expect(assets.entries.has("ec/init")).toBe(true);
    });
  });

  it("stores module as type=module attribute", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(
        <Script name="mod" module>
          {"/* module */"}
        </Script>,
      );
      const { assets } = strictFlow();
      expect(assets.entries.get("mod")?.attrs).toEqual({ type: "module" });
    });
  });

  it("stores defer as boolean attribute", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(
        <Script name="late" defer>
          {"/* deferred */"}
        </Script>,
      );
      const { assets } = strictFlow();
      expect(assets.entries.get("late")?.attrs).toEqual({ defer: true });
    });
  });

  it("stores src attribute when provided", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await renderToString(<Script name="jquery" src="/vendor/jquery.js" />);
      const { assets } = strictFlow();
      expect(assets.entries.get("jquery")?.attrs).toEqual({
        src: "/vendor/jquery.js",
      });
    });
  });
});

describe("Style + Script — integration with resolveAssets", () => {
  it("resolves a Style marker to a style tag", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<Style name="ec/base">{"body { color: red }"}</Style>);
      const { assets } = strictFlow();
      const resolved = await resolveAssets(html, assets);
      expect(resolved).toBe('<style data-name="ec/base">body { color: red }</style>');
    });
  });

  it("resolves a Script marker to a script tag with module", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <Script name="ec/init" module>
          {() => "console.log('init')"}
        </Script>,
      );
      const { assets } = strictFlow();
      const resolved = await resolveAssets(html, assets);
      expect(resolved).toBe(
        '<script data-name="ec/init" type="module">console.log(\'init\')</script>',
      );
    });
  });

  it("resolves Script with src (no content)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<Script name="jquery" src="/vendor/jquery.js" />);
      const { assets } = strictFlow();
      const resolved = await resolveAssets(html, assets);
      expect(resolved).toBe('<script data-name="jquery" src="/vendor/jquery.js"></script>');
    });
  });

  it("resolves multiple assets in parallel correctly", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(
        <>
          <Style name="base">{"body { }"}</Style>
          <Script name="init" module>
            {"console.log('init')"}
          </Script>
        </>,
      );
      const { assets } = strictFlow();
      const resolved = await resolveAssets(html, assets);
      expect(resolved).toContain('<style data-name="base">');
      expect(resolved).toContain('<script data-name="init" type="module">');
    });
  });
});
