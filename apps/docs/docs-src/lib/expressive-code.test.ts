import { describe, expect, it } from "bun:test";
import { ExpressiveCodeBlock } from "satteri-expressive-code";

import {
  expressiveCodeScript,
  expressiveCodeStyles,
  getRenderer,
  getSharedRenderer,
} from "./expressive-code.js";

describe("Expressive Code assets", () => {
  it("one renderer, shared by both emitters", async () => {
    expect((await getSharedRenderer()).ec).toBe((await getRenderer()).ec);
  });

  it("the shared renderer carries no page-independent asset", async () => {
    const { baseStyles, themeStyles, jsModules } = await getSharedRenderer();
    expect({ baseStyles, themeStyles, jsModules }).toEqual({
      baseStyles: "",
      themeStyles: "",
      jsModules: [],
    });
  });

  it("the hoisted assets are not empty", async () => {
    // An empty string here ships unstyled code blocks, silently.
    expect((await expressiveCodeStyles()).length).toBeGreaterThan(1000);
    expect((await expressiveCodeScript()).length).toBeGreaterThan(100);
  });

  /** The themes follow the site's `dark` class, not the operating system. */
  describe("theme variants are bound to the site's switch", () => {
    it("scopes the dark theme behind the `dark` class", async () => {
      expect(await expressiveCodeStyles()).toContain(":root.dark .expressive-code");
    });

    it("emits no prefers-color-scheme query", async () => {
      // The init script already folds the OS preference into the class.
      expect(await expressiveCodeStyles()).not.toContain("prefers-color-scheme");
    });

    it("leaves the light theme unscoped, as the default", async () => {
      expect(await expressiveCodeStyles()).toContain(":root{--ec-");
    });
  });

  /**
   * The hoist rests on this. If an upgrade starts returning per-render styles,
   * the `CodeBlock` path would drop them — better a failure than a silent one.
   */
  it("rendering a block asks for no styles beyond the base stylesheet", async () => {
    const { ec } = await getRenderer();
    for (const language of ["ts", "js", "bash", "json", "tsx"]) {
      const { styles } = await ec.render(
        new ExpressiveCodeBlock({ code: "const answer = 42", language }),
      );
      expect([...styles], `${language} asked for per-render styles`).toEqual([]);
    }
  });
});
