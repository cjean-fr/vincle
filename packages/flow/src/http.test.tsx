import { describe, it, expect } from "bun:test";

import { NativeAdapter, HtmxAdapter } from "./adapters/index.js";
import { serve, negotiateHtmx } from "./http.js";
import { Defer } from "./index.js";

describe("HTTP negotiation (decoupled from the adapter)", () => {
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
            <Defer>{() => <span>x</span>}</Defer>
          </body>
        </html>
      ),
      NativeAdapter,
    );
    expect(await res.text()).toContain("MutationObserver");
  });
});
