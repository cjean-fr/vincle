import { Asset, assetUrl, setVite, type ViteManifest } from "./index.js";
import { withScope, renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

async function render(node: unknown): Promise<string> {
  return renderToString(node as Parameters<typeof renderToString>[0]);
}

describe("Asset (dev mode)", () => {
  it("emits a stylesheet link for a .css entry", async () => {
    await withScope(async () => {
      setVite(null);
      const html = await render(<Asset entry="src/styles/main.css" />);
      expect(html).toContain(
        '<link rel="stylesheet" href="/src/styles/main.css"',
      );
    });
  });

  it("emits a module script for a .ts entry", async () => {
    await withScope(async () => {
      setVite(null);
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).toContain('<script type="module" src="/src/main.ts">');
    });
  });

  it("does not emit the Vite HMR client (transformIndexHtml handles it)", async () => {
    await withScope(async () => {
      setVite(null);
      const html = await render(
        <>
          <Asset entry="src/main.ts" />
          <Asset entry="src/other.ts" />
        </>,
      );
      expect(html).not.toContain("@vite/client");
    });
  });

  it("respects a custom base URL", async () => {
    await withScope(async () => {
      setVite(null, { base: "/app/" });
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).toContain('src="/app/src/main.ts"');
    });
  });
});

describe("Asset (production mode)", () => {
  const manifest: ViteManifest = {
    "src/main.ts": {
      file: "assets/main-abc123.js",
      src: "src/main.ts",
      isEntry: true,
      imports: ["_shared-xyz789.js"],
      css: ["assets/main-Bx7k2c.css"],
    },
    "_shared-xyz789.js": {
      file: "assets/shared-xyz789.js",
      name: "shared",
    },
    "src/styles/main.css": {
      file: "assets/main-only-d4f6.css",
      src: "src/styles/main.css",
      isEntry: true,
    },
  };

  it("resolves a JS entry to its hashed file", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).toContain(
        '<script type="module" src="/assets/main-abc123.js">',
      );
    });
  });

  it("emits co-bundled CSS before the script", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await render(<Asset entry="src/main.ts" />);
      const cssIdx = html.indexOf("main-Bx7k2c.css");
      const jsIdx = html.indexOf("main-abc123.js");
      expect(cssIdx).toBeGreaterThan(-1);
      expect(jsIdx).toBeGreaterThan(cssIdx);
    });
  });

  it("emits modulepreload links for transitive imports", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).toContain(
        '<link rel="modulepreload" href="/assets/shared-xyz789.js"',
      );
    });
  });

  it("resolves a CSS-only entry as a stylesheet link", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await render(<Asset entry="src/styles/main.css" />);
      expect(html).toContain(
        '<link rel="stylesheet" href="/assets/main-only-d4f6.css"',
      );
      expect(html).not.toContain("<script");
    });
  });

  it("throws when the entry is not found in the manifest", async () => {
    await withScope(async () => {
      setVite(manifest);
      await expect(
        render(<Asset entry="src/does-not-exist.ts" />),
      ).rejects.toThrow(/not found in manifest/);
    });
  });

  it("never emits the Vite dev client in production", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).not.toContain("@vite/client");
    });
  });

  it("respects a custom base URL", async () => {
    await withScope(async () => {
      setVite(manifest, { base: "/cdn/" });
      const html = await render(<Asset entry="src/main.ts" />);
      expect(html).toContain('src="/cdn/assets/main-abc123.js"');
      expect(html).toContain('href="/cdn/assets/main-Bx7k2c.css"');
    });
  });
});

describe("Asset (no setup)", () => {
  it("throws a clear error when setVite was not called", async () => {
    await withScope(async () => {
      await expect(render(<Asset entry="src/main.ts" />)).rejects.toThrow(
        /context not found/,
      );
    });
  });
});

describe("assetUrl (dev mode)", () => {
  it("returns the source path under the base in dev", async () => {
    await withScope(async () => {
      setVite(null);
      expect(assetUrl("src/logo.svg")).toBe("/src/logo.svg");
      expect(assetUrl("src/fonts/inter.woff2")).toBe("/src/fonts/inter.woff2");
    });
  });

  it("respects a custom base URL", async () => {
    await withScope(async () => {
      setVite(null, { base: "/app/" });
      expect(assetUrl("src/logo.svg")).toBe("/app/src/logo.svg");
    });
  });

  it("works inside a JSX attribute", async () => {
    await withScope(async () => {
      setVite(null);
      const html = await renderToString(
        <link rel="icon" href={assetUrl("src/favicon.svg")} />,
      );
      expect(html).toContain('href="/src/favicon.svg"');
    });
  });
});

describe("assetUrl (production mode)", () => {
  const manifest: ViteManifest = {
    "src/logo.svg": {
      file: "assets/logo-Bx7k2.svg",
      src: "src/logo.svg",
    },
    "src/fonts/inter.woff2": {
      file: "assets/inter-abc123.woff2",
      src: "src/fonts/inter.woff2",
    },
  };

  it("returns the hashed file path under the base", async () => {
    await withScope(async () => {
      setVite(manifest);
      expect(assetUrl("src/logo.svg")).toBe("/assets/logo-Bx7k2.svg");
      expect(assetUrl("src/fonts/inter.woff2")).toBe(
        "/assets/inter-abc123.woff2",
      );
    });
  });

  it("respects a custom base URL", async () => {
    await withScope(async () => {
      setVite(manifest, { base: "/cdn/" });
      expect(assetUrl("src/logo.svg")).toBe("/cdn/assets/logo-Bx7k2.svg");
    });
  });

  it("throws when the entry is not in the manifest", async () => {
    await withScope(async () => {
      setVite(manifest);
      expect(() => assetUrl("src/does-not-exist.png")).toThrow(
        /not found in manifest/,
      );
    });
  });

  it("composes with arbitrary tags", async () => {
    await withScope(async () => {
      setVite(manifest);
      const html = await renderToString(
        <img src={assetUrl("src/logo.svg")} alt="logo" />,
      );
      expect(html).toContain('src="/assets/logo-Bx7k2.svg"');
      expect(html).toContain('alt="logo"');
    });
  });
});
