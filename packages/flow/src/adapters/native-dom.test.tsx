import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { Defer, renderToStatic, renderToStream } from "../index.js";
import { collect } from "../test-utils.js";
import { NativeAdapter, NATIVE_POLYFILL, WebPlatformAdapter } from "./index.js";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function browser(html: string, loading = false) {
  const window = new Window({
    url: "https://app.example/page",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  window.document.body.innerHTML = html;
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: loading ? "loading" : "complete",
  });
  const requests: string[] = [];
  window.fetch = (async (url: string) => {
    requests.push(String(url));
    return new window.Response('<nav id="loaded">Links</nav>');
  }) as typeof window.fetch;
  return {
    window,
    document: window.document,
    requests,
    start: () => window.eval(NATIVE_POLYFILL),
    close: () => window.happyDOM.abort(),
  };
}

describe("Native template src: browser behavior", () => {
  it("SSG: replaces fallback with the actual emitted fragment", async () => {
    const files = new Map<string, string>();
    const shell = await renderToStatic(
      async (ctx) => {
        const html = await ctx.renderPage(() => (
          <html>
            <head />
            <body>
              <Defer target="nav" fallback={<p id="fallback">Loading</p>}>
                <nav id="loaded">Links</nav>
              </Defer>
            </body>
          </html>
        ));
        await ctx.emitFragments((_id, url, fragmentHtml) => {
          files.set(url, fragmentHtml);
        });
        return html;
      },
      { adapter: NativeAdapter },
    );
    const page = browser(shell);
    page.window.fetch = (async (url: string) => {
      page.requests.push(String(url));
      return new page.window.Response(files.get(String(url)), {
        status: files.has(String(url)) ? 200 : 404,
      });
    }) as typeof page.window.fetch;
    try {
      page.start();
      await tick();
      await tick();
      expect(page.requests).toEqual(["/fragments/nav.html"]);
      expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
      expect(page.document.querySelector("#fallback")).toBeNull();
      expect(page.document.querySelector("template[src]")).toBeNull();
    } finally {
      await page.close();
    }
  });

  it("loads an in-place include without a named target", async () => {
    const page = browser('<main><template src="/nav.html"></template><footer>End</footer></main>');
    try {
      page.start();
      await tick();
      await tick();
      expect(page.requests).toEqual(["/nav.html"]);
      expect(page.document.querySelector("main")?.textContent).toBe("LinksEnd");
      expect(page.document.querySelector("template")).toBeNull();
    } finally {
      await page.close();
    }
  });

  it("stream: discovers includes inside an arriving subtree", async () => {
    const page = browser("", true);
    try {
      page.start();
      page.document.body.insertAdjacentHTML(
        "beforeend",
        '<section><template src="/nav.html" for=""></template><footer>End</footer></section>',
      );
      await tick();
      await tick();
      expect(page.requests).toEqual(["/nav.html"]);
      expect(page.document.querySelector("section")?.textContent).toBe("LinksEnd");
    } finally {
      await page.close();
    }
  });

  it("waits for a streaming patch to finish parsing before consuming it", async () => {
    const page = browser('<?start name="nav"><p>Loading</p><?end>', true);
    try {
      page.start();
      const patch = page.document.createElement("template");
      patch.setAttribute("for", "nav");
      page.document.body.append(patch);
      await tick();
      expect(patch.isConnected).toBe(true);
      expect(page.document.body.textContent).toBe("Loading");
      patch.innerHTML = '<nav id="loaded">Links</nav>';
      page.document.body.append(page.document.createTextNode("\n"));
      await tick();
      expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
      expect(patch.isConnected).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("keeps fallback and surrounding content when the range has no closing marker", async () => {
    const page = browser(
      '<?start name="nav"><p>Loading</p><footer>End</footer><template for="nav"><nav>Links</nav></template>',
    );
    try {
      page.start();
      await tick();
      expect(page.document.querySelector("p")?.textContent).toBe("Loading");
      expect(page.document.querySelector("footer")?.textContent).toBe("End");
      expect(page.document.querySelector("template")).not.toBeNull();
    } finally {
      await page.close();
    }
  });

  it("keeps fallback on HTTP failure instead of inserting the error page", async () => {
    const page = browser(
      '<?start name="nav"><p>Loading</p><?end><template for="nav" src="/missing.html"></template>',
    );
    page.window.fetch = (async () =>
      new page.window.Response("Error page", { status: 404 })) as typeof page.window.fetch;
    try {
      page.start();
      await tick();
      await tick();
      expect(page.document.querySelector("p")?.textContent).toBe("Loading");
      expect(page.document.body.textContent).not.toContain("Error page");
    } finally {
      await page.close();
    }
  });

  it("fetches only once while unrelated DOM mutations arrive", async () => {
    const page = browser('<template src="/nav.html"></template>');
    let resolve!: (response: InstanceType<typeof page.window.Response>) => void;
    page.window.fetch = ((url: string) => {
      page.requests.push(String(url));
      return new Promise((done) => {
        resolve = done;
      });
    }) as typeof page.window.fetch;
    try {
      page.start();
      page.document.body.append(page.document.createElement("aside"));
      await tick();
      page.document.body.append(page.document.createElement("footer"));
      await tick();
      expect(page.requests).toEqual(["/nav.html"]);
      resolve(new page.window.Response('<nav id="loaded">Links</nav>'));
      await tick();
      await tick();
      expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
    } finally {
      await page.close();
    }
  });

  it("handles a rejected fetch without replacing fallback", async () => {
    const page = browser(
      '<?start name="nav"><p>Loading</p><?end><template for="nav" src="/nav.html"></template>',
    );
    page.window.fetch = (async () => {
      throw new Error("Network failure");
    }) as typeof page.window.fetch;
    try {
      page.start();
      await tick();
      await tick();
      expect(page.document.querySelector("p")?.textContent).toBe("Loading");
      expect(page.document.querySelector("template[src]")).not.toBeNull();
    } finally {
      await page.close();
    }
  });

  it("aborts a pending request when its template is disconnected", async () => {
    const page = browser('<template src="/nav.html"></template>');
    let signal: AbortSignal | undefined;
    page.window.fetch = ((_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise(() => {});
    }) as typeof page.window.fetch;
    try {
      page.start();
      page.document.querySelector("template")!.remove();
      await tick();
      expect(signal?.aborted).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("retries insertion when the target range arrives after the response", async () => {
    const page = browser('<template for="nav" src="/nav.html"></template>');
    try {
      page.start();
      await tick();
      await tick();
      expect(page.document.querySelector("#loaded")).toBeNull();
      const fragment = page.document.createElement("template");
      fragment.innerHTML = '<?start name="nav"><p>Loading</p><?end>';
      page.document.body.prepend(fragment.content);
      await tick();
      expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
      expect(page.requests).toEqual(["/nav.html"]);
    } finally {
      await page.close();
    }
  });

  it("loads nested includes from the fetched fragment", async () => {
    const page = browser('<template src="/outer.html"></template>');
    page.window.fetch = (async (url: string) => {
      page.requests.push(String(url));
      return new page.window.Response(
        url === "/outer.html"
          ? '<section><template src="/inner.html"></template></section>'
          : '<nav id="loaded">Links</nav>',
      );
    }) as typeof page.window.fetch;
    try {
      page.start();
      await tick();
      await tick();
      await tick();
      expect(page.requests).toEqual(["/outer.html", "/inner.html"]);
      expect(page.document.querySelector("section #loaded")?.textContent).toBe("Links");
    } finally {
      await page.close();
    }
  });

  it("consumes a final streaming patch at DOMContentLoaded", async () => {
    const page = browser('<?start name="nav"><p>Loading</p><?end>', true);
    try {
      page.start();
      page.document.body.insertAdjacentHTML(
        "beforeend",
        '<template for="nav"><nav id="loaded">Links</nav></template>',
      );
      await tick();
      expect(page.document.querySelector("#loaded")).toBeNull();
      page.document.dispatchEvent(new page.window.Event("DOMContentLoaded"));
      await tick();
      expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
    } finally {
      await page.close();
    }
  });

  it("preserves nested ranges and surrounding elements", async () => {
    for (const content of [
      '<div><?start name="inner"><p>Nested</p><?end></div>',
      '<?start name="inner"><p>Nested</p><?end><aside>More</aside>',
    ]) {
      const page = browser(
        '<?start name="nav">' +
          content +
          '<?end><footer>End</footer><template for="nav"><nav id="loaded">Links</nav></template>',
      );
      try {
        page.start();
        await tick();
        expect(page.document.querySelector("#loaded")?.textContent).toBe("Links");
        expect(page.document.querySelector("footer")?.textContent).toBe("End");
        expect(page.document.querySelector("aside")).toBeNull();
        expect(page.document.querySelector("div")).toBeNull();
      } finally {
        await page.close();
      }
    }
  });

  it("keeps orphan patches in the DOM", async () => {
    const page = browser('<template for="missing"><nav>Links</nav></template>');
    try {
      page.start();
      await tick();
      expect(page.document.querySelector("template")).not.toBeNull();
      expect(page.document.querySelector("nav")).toBeNull();
    } finally {
      await page.close();
    }
  });

  it("patches real processing-instruction ranges in browsers with partial WICG support", async () => {
    const page = browser("");
    const { document } = page;
    document.body.append(document.createProcessingInstruction("start", 'name="nav"'));
    const fallback = document.createElement("p");
    fallback.textContent = "Loading";
    document.body.append(fallback, document.createProcessingInstruction("end", ""));
    const patch = document.createElement("template");
    patch.setAttribute("data-for", "nav");
    patch.innerHTML = '<nav id="loaded">Links</nav>';
    document.body.append(patch);
    try {
      page.start();
      await tick();
      expect(document.querySelector("#loaded")?.textContent).toBe("Links");
      expect(fallback.isConnected).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("supports a named insertion marker", async () => {
    const page = browser(
      '<?marker name="nav"><footer>End</footer><template data-for="nav"><nav id="loaded">Links</nav></template>',
    );
    try {
      page.start();
      await tick();
      expect(page.document.body.textContent).toBe("LinksEnd");
    } finally {
      await page.close();
    }
  });

  it("applies all four supported merge positions", async () => {
    for (const [merge, expected] of [
      ["append", "BeforeOldNewAfter"],
      ["prepend", "BeforeNewOldAfter"],
      ["before", "BeforeNewOldAfter"],
      ["after", "BeforeOldNewAfter"],
    ] as const) {
      const page = browser(
        `<header>Before</header><section id="nav">Old</section><footer>After</footer><template data-for="nav" data-merge="${merge}"><b>New</b></template>`,
      );
      try {
        page.start();
        await tick();
        expect(page.document.body.textContent).toBe(expected);
        expect(page.document.querySelector("b")?.parentElement?.tagName).toBe(
          merge === "append" || merge === "prepend" ? "SECTION" : "BODY",
        );
      } finally {
        await page.close();
      }
    }
  });

  it("rejects non-HTTP fragment URLs", async () => {
    for (const src of [
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "blob:https://app.example/id",
      "vbscript:msgbox(1)",
      "#blocked",
    ]) {
      const page = browser(`<template src="${src}"></template>`);
      try {
        page.start();
        await tick();
        expect(page.requests).toEqual([]);
      } finally {
        await page.close();
      }
    }
  });
});

describe("Native → WebPlatform migration", () => {
  for (const mode of ["ssg", "stream"] as const) {
    it(`${mode}: raw template src injects the runtime only for Native`, async () => {
      const render = async (adapter: typeof NativeAdapter | typeof WebPlatformAdapter) =>
        mode === "ssg"
          ? renderToStatic(
              (ctx) =>
                ctx.renderPage(() => (
                  <html>
                    <head />
                    <body>
                      <template src="/nav.html" for="" />
                    </body>
                  </html>
                )),
              { adapter },
            )
          : collect(
              renderToStream(
                () => (
                  <html>
                    <head />
                    <body>
                      <template src="/nav.html" for="" />
                    </body>
                  </html>
                ),
                adapter,
              ),
            );
      const native = await render(NativeAdapter);
      const platform = await render(WebPlatformAdapter);
      expect(native).toContain(`<script>${NATIVE_POLYFILL}</script>`);
      expect(platform).not.toContain("<script");
      expect(
        native.replace(`<script>${NATIVE_POLYFILL}</script>`, "").replaceAll("data-for=", "for="),
      ).toBe(platform);
    });
  }
});

describe("Native → WebPlatform deferred content", () => {
  for (const mode of ["ssg", "stream"] as const) {
    it(`${mode}: changing only the adapter preserves the page and fragment paths`, async () => {
      const page = () => (
        <html>
          <head />
          <body>
            <Defer target="nav" fallback={<p>Loading</p>}>
              <nav>Links</nav>
            </Defer>
          </body>
        </html>
      );
      const render = async (adapter: typeof NativeAdapter | typeof WebPlatformAdapter) => {
        const files: Record<string, string> = {};
        const html =
          mode === "ssg"
            ? await renderToStatic(
                async (ctx) => {
                  const shellHtml = await ctx.renderPage(page);
                  await ctx.emitFragments((_id, url, content) => {
                    files[url] = content;
                  });
                  return shellHtml;
                },
                { adapter },
              )
            : await collect(renderToStream(page, adapter));
        return { html, files };
      };
      const native = await render(NativeAdapter);
      const platform = await render(WebPlatformAdapter);
      expect(
        native.html
          .replace(`<script>${NATIVE_POLYFILL}</script>`, "")
          .replaceAll("data-for=", "for="),
      ).toBe(platform.html);
      expect(native.files).toEqual(platform.files);
      expect(platform.html).not.toContain("<script");
      expect(platform.html).not.toContain("data-for");
      if (mode === "ssg") expect(platform.files["/fragments/nav.html"]).toBe("<nav>Links</nav>");
      else expect(platform.html).toContain('<template for="nav"><nav>Links</nav></template>');
    });
  }
});
