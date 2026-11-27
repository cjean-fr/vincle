import { describe, it, expect } from "bun:test";

import { NativeAdapter, HtmxAdapter } from "./adapters/index.js";
import { serve, negotiateFetch, negotiateHtmx } from "./http.js";
import { Defer } from "./index.js";

describe("HTTP negotiation (decoupled from the adapter)", () => {
  for (const source of ["request", "options"] as const) {
    it(`serve forwards in-flight cancellation from ${source}`, async () => {
      const request = new AbortController();
      const options = new AbortController();
      const started = Promise.withResolvers<AbortSignal>();
      const res = await serve(
        new Request("http://localhost", { signal: request.signal }),
        () => (
          <Defer target="blocked">
            {(signal) => {
              started.resolve(signal);
              return new Promise<never>(() => {});
            }}
          </Defer>
        ),
        HtmxAdapter,
        { signal: options.signal },
      );
      const body = res.text();
      const signal = await started.promise;
      const reason = new Error("cancelled");
      (source === "request" ? request : options).abort(reason);
      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(reason);
      await body;
    }, 1000);
  }

  it("serve skips rendering an already cancelled request without options", async () => {
    const controller = new AbortController();
    controller.abort();
    let rendered = false;
    const res = await serve(
      new Request("http://localhost", { signal: controller.signal }),
      () => {
        rendered = true;
        return <span>unreachable</span>;
      },
      HtmxAdapter,
    );
    expect(await res.text()).toBe("");
    expect(rendered).toBe(false);
  });

  it("negotiateHtmx reads HX-Target and sets Vary", () => {
    const n = negotiateHtmx(new Request("http://localhost", { headers: { "HX-Target": "my-id" } }));
    expect(n.target).toBe("my-id");
    expect(new Headers(n.headers).get("Vary")).toContain("HX-Target");
  });

  it("serve runs an opt-in negotiate fn; negotiation headers win", async () => {
    const res = await serve(
      new Request("http://localhost", { headers: { "HX-Target": "zone" } }),
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      HtmxAdapter,
      { negotiate: negotiateHtmx, headers: { "cache-control": "no-store" } },
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("Vary")).toContain("HX-Target");
    expect(await res.text()).toContain("hi");
  });

  it("serve unions a caller's Vary with the negotiator's instead of overwriting it", async () => {
    const res = await serve(
      new Request("http://localhost", { headers: { "HX-Target": "zone" } }),
      () => (
        <html>
          <body>
            <p>hi</p>
          </body>
        </html>
      ),
      HtmxAdapter,
      { negotiate: negotiateHtmx, headers: { Vary: "Cookie" } },
    );
    const vary = res.headers.get("Vary") ?? "";
    expect(vary).toContain("Cookie");
    expect(vary).toContain("HX-Target");
  });

  it("serve passes negotiation hints to the page", async () => {
    const res = await serve(
      new Request("http://localhost", { headers: { "HX-Target": "content" } }),
      (n) => (
        <html>
          <body>{n.target === "content" ? <p>fragment</p> : <p>full</p>}</body>
        </html>
      ),
      NativeAdapter,
      { negotiate: negotiateHtmx },
    );
    expect(await res.text()).toContain("fragment");
  });

  it("serve with NativeAdapter injects the polyfill", async () => {
    const res = await serve(
      new Request("http://localhost"),
      () => (
        <html>
          <head></head>
          <body>
            <p>hi</p>
            <Defer target="x">
              <span>stream</span>
            </Defer>
          </body>
        </html>
      ),
      NativeAdapter,
    );
    expect(await res.text()).toContain("MutationObserver");
  });

  describe("htmx with the sse extension", () => {
    const sseReq = (extra: Record<string, string> = {}) =>
      new Request("http://localhost", {
        headers: { "HX-Request": "true", Accept: "text/html, text/event-stream", ...extra },
      });
    const page = () => (
      <ul>
        <Defer fallback={<li>wait</li>}>{async () => <li>done{"\n"}two lines</li>}</Defer>
      </ul>
    );

    it("negotiateHtmx picks the event stream only for an htmx request that accepts it", () => {
      expect(negotiateHtmx(sseReq()).transport).toBe("sse");
      const vary = new Headers(negotiateHtmx(sseReq()).headers).get("Vary");
      expect(vary).toContain("Accept");
      const noAccept = new Request("http://localhost", { headers: { "HX-Request": "true" } });
      expect(negotiateHtmx(noAccept).transport).toBeUndefined();
      const plain = new Request("http://localhost", { headers: { Accept: "text/event-stream" } });
      expect(negotiateHtmx(plain).transport).toBeUndefined();
    });

    it("serve answers with one event for the shell, then one per patch", async () => {
      const res = await serve(sseReq(), page, HtmxAdapter, { negotiate: negotiateHtmx });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const events = (await res.text()).split("\n\n").filter(Boolean);
      expect(events).toHaveLength(2);
      expect(events[0]).toBe('data: <ul><div id="fragment-1"><li>wait</li></div></ul>');
      expect(events[1]).toBe(
        'data: <div id="fragment-1" hx-swap-oob="outerHTML"><li>done\n' +
          "data: two lines</li></div>",
      );
    });

    it("serve gives its fragments the requested id prefix", async () => {
      const res = await serve(sseReq(), page, HtmxAdapter, {
        negotiate: negotiateHtmx,
        idPrefix: "replies-",
      });
      const text = await res.text();
      expect(text).toContain('id="replies-1"');
      expect(text).not.toContain("fragment-1");
    });

    it("serve keeps the plain HTML body when the extension is not in play", async () => {
      const res = await serve(
        new Request("http://localhost", { headers: { "HX-Request": "true" } }),
        page,
        HtmxAdapter,
        { negotiate: negotiateHtmx },
      );
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).not.toContain("data: ");
    });
  });

  describe('serve with mode: "partial"', () => {
    const page = () => (
      <ul>
        <Defer fallback={<li>wait</li>}>{async () => <li>done</li>}</Defer>
      </ul>
    );

    it("sends the content, its placeholders and the patches, with no polyfill or document tags", async () => {
      const res = await serve(new Request("http://localhost"), page, NativeAdapter, {
        mode: "partial",
      });
      const text = await res.text();
      expect(text).toStartWith("<ul><?start");
      expect(text).toContain("wait");
      expect(text).toContain("<template");
      expect(text).toContain("done");
      expect(text).not.toContain("<script");
      expect(text).not.toContain("<head");
    });

    it("keeps the polyfill in a full render of the same page", async () => {
      const res = await serve(new Request("http://localhost"), page, NativeAdapter);
      expect(await res.text()).toContain("<script>");
    });

    it("drops the closing document tags", async () => {
      const res = await serve(
        new Request("http://localhost"),
        () => (
          <html>
            <body>
              <p>x</p>
            </body>
          </html>
        ),
        NativeAdapter,
        { mode: "partial" },
      );
      expect(await res.text()).not.toContain("</html>");
    });
  });

  describe("negotiateFetch", () => {
    const page = () => (
      <ul>
        <Defer fallback={<li>wait</li>}>{async () => <li>done</li>}</Defer>
      </ul>
    );
    const ask = (headers: Record<string, string>) =>
      serve(new Request("http://localhost", { headers }), page, NativeAdapter, {
        negotiate: negotiateFetch,
      });

    it("answers a request that asks for an event stream with a partial one", async () => {
      const res = await ask({ Accept: "text/event-stream" });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("vary")).toBe("Accept");
      const text = await res.text();
      expect(text).toStartWith("data: <ul>");
      expect(text).not.toContain("<script");
    });

    it("serves the page to a navigation and to a plain fetch, whatever Sec-Fetch says", async () => {
      const requests: Record<string, string>[] = [
        {
          Accept: "text/html,application/xhtml+xml",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
        },
        { Accept: "*/*", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" },
        {},
      ];
      for (const headers of requests) {
        const res = await ask(headers);
        expect(res.headers.get("content-type")).toContain("text/html");
        expect(res.headers.get("vary")).toBe("Accept");
        expect(await res.text()).toContain("<script>");
      }
    });

    it("lets explicit options override what the request asked for", async () => {
      const res = await serve(
        new Request("http://localhost", { headers: { Accept: "text/event-stream" } }),
        page,
        NativeAdapter,
        { negotiate: negotiateFetch, mode: "full", transport: "html" },
      );
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain("<script>");
    });
  });
});
