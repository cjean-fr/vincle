import { describe, it, expect } from "bun:test";
import {
  createAssetState,
  createMarker,
  registerAsset,
  resolveAssets,
} from "./assets.js";

describe("createAssetState", () => {
  it("creates an empty state", () => {
    const state = createAssetState();
    expect(state.entries.size).toBe(0);
    expect(state.emitted.size).toBe(0);
  });
});

describe("createMarker", () => {
  it("creates a style marker", () => {
    expect(createMarker("style", "ec/base")).toBe(
      "<!-- vincle:style:ec/base -->",
    );
  });

  it("creates a script marker", () => {
    expect(createMarker("script", "jquery")).toBe(
      "<!-- vincle:script:jquery -->",
    );
  });

  it("handles names with slashes", () => {
    expect(createMarker("style", "ec/s-hash123")).toBe(
      "<!-- vincle:style:ec/s-hash123 -->",
    );
  });
});

describe("resolveAssets", () => {
  it("deduplicates: N markers same name → 1 tag at first position", async () => {
    const state = createAssetState();
    registerAsset(state, "ec/base", {
      type: "style",
      content: "body { color: red }",
      attrs: {},
    });

    const html = [
      "<html><head>",
      createMarker("style", "ec/base"),
      "</head><body>",
      createMarker("style", "ec/base"),
      createMarker("style", "ec/base"),
      "<p>hi</p></body></html>",
    ].join("");

    const result = await resolveAssets(html, state);

    expect(result).toContain(
      '<style data-name="ec/base">body { color: red }</style>',
    );
    // Only one style tag
    expect((result.match(/<style data-name="ec\/base">/g) ?? []).length).toBe(
      1,
    );
    // The second and third markers should be gone (empty)
    const firstPos = result.indexOf("<style ");
    const afterFirst = result.slice(firstPos + 1);
    expect(afterFirst).not.toContain(createMarker("style", "ec/base"));
  });

  it("evaluates factory content lazily (pay-for-use)", async () => {
    const state = createAssetState();
    let evaluated = 0;
    registerAsset(state, "lazy", {
      type: "style",
      content: () => {
        evaluated++;
        return Promise.resolve(".lazy { color: blue }");
      },
      attrs: {},
    });

    const html = [
      "<div>",
      createMarker("style", "lazy"),
      createMarker("style", "lazy"),
      "</div>",
    ].join("");

    const result = await resolveAssets(html, state);

    expect(evaluated).toBe(1); // only evaluated once
    expect(result).toContain(".lazy { color: blue }");
    expect(result).not.toContain(createMarker("style", "lazy"));
  });

  it("does not evaluate factory for already-emitted names", async () => {
    const state = createAssetState();
    let evaluated = 0;
    registerAsset(state, "already", {
      type: "style",
      content: () => {
        evaluated++;
        return ".already { }";
      },
      attrs: {},
    });

    // Pre-mark as emitted (simulating shell having already resolved this)
    state.emitted.add("already");

    const html = "<div>" + createMarker("style", "already") + "</div>";
    const result = await resolveAssets(html, state);

    expect(evaluated).toBe(0);
    expect(result).not.toContain("<style");
    expect(result).not.toContain(createMarker("style", "already"));
    expect(result).toBe("<div></div>");
  });

  it("different names are both resolved", async () => {
    const state = createAssetState();
    registerAsset(state, "a", {
      type: "style",
      content: ".a { }",
      attrs: {},
    });
    registerAsset(state, "b", {
      type: "script",
      content: "console.log('b')",
      attrs: { type: "module" },
    });

    const html = [createMarker("style", "a"), createMarker("script", "b")].join(
      "",
    );

    const result = await resolveAssets(html, state);

    expect(result).toContain('<style data-name="a">.a { }</style>');
    expect(result).toContain(
      '<script type="module" data-name="b">console.log(\'b\')</script>',
    );
  });

  it("throws if style content contains </style", async () => {
    const state = createAssetState();
    registerAsset(state, "bad", {
      type: "style",
      content: "</style><script>alert(1)</script>",
      attrs: {},
    });

    const html = createMarker("style", "bad");
    await expect(resolveAssets(html, state)).rejects.toThrow(
      /contains <\/style/,
    );
  });

  it("escapes </script in script content", async () => {
    const state = createAssetState();
    registerAsset(state, "safe", {
      type: "script",
      content: 'var x = "</script>";',
      attrs: {},
    });

    const html = createMarker("script", "safe");
    const result = await resolveAssets(html, state);

    // Content should have <\/script instead of </script
    const contentStart = result.indexOf(">") + 1;
    const contentEnd = result.lastIndexOf("</script>");
    const inner = result.slice(contentStart, contentEnd);
    expect(inner).toContain("<\\/script>");
    expect(inner).not.toContain("</script>");
  });

  it("handles script content with no </script (no-op escape)", async () => {
    const state = createAssetState();
    registerAsset(state, "nope", {
      type: "script",
      content: "console.log('ok')",
      attrs: {},
    });

    const html = createMarker("script", "nope");
    const result = await resolveAssets(html, state);

    expect(result).toContain("console.log('ok')");
  });

  it("resolves script with src (no inline content)", async () => {
    const state = createAssetState();
    registerAsset(state, "jquery", {
      type: "script",
      content: "",
      attrs: { src: "/vendor/jquery.js" },
    });

    const html = createMarker("script", "jquery");
    const result = await resolveAssets(html, state);

    expect(result).toContain('src="/vendor/jquery.js"');
    expect(result).toContain('data-name="jquery"');
    expect(result).toContain("></script>");
  });

  it("multiple markers of different names resolve in document order", async () => {
    const state = createAssetState();
    registerAsset(state, "first", {
      type: "style",
      content: ".first { }",
      attrs: {},
    });
    registerAsset(state, "second", {
      type: "style",
      content: ".second { }",
      attrs: {},
    });
    registerAsset(state, "third", {
      type: "script",
      content: "/* third */",
      attrs: {},
    });

    const html = [
      createMarker("style", "first"),
      createMarker("style", "second"),
      createMarker("script", "third"),
    ].join("");

    const result = await resolveAssets(html, state);

    const firstPos = result.indexOf(".first");
    const secondPos = result.indexOf(".second");
    const thirdPos = result.indexOf("/* third */");

    expect(firstPos).toBeGreaterThan(-1);
    expect(secondPos).toBeGreaterThan(firstPos);
    expect(thirdPos).toBeGreaterThan(secondPos);
  });

  it("only first occurrence of duplicate name is kept, at document position", async () => {
    const state = createAssetState();
    registerAsset(state, "dup", {
      type: "style",
      content: ".dup { }",
      attrs: { media: "screen" },
    });

    // Simulate first occurrence in head, then another in body
    const html = [
      "<head>",
      createMarker("style", "dup"),
      "</head><body>",
      createMarker("style", "dup"),
      "<p>content</p>",
      "</body>",
    ].join("");

    const result = await resolveAssets(html, state);

    // The style tag should be in the head (first position)
    expect(result).toContain('<head><style media="screen" data-name="dup">');
    // Second marker removed
    expect(result).not.toContain(createMarker("style", "dup"));
  });
});
