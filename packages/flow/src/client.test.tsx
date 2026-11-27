import { raw, type JSX } from "@vincle/core";
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { NATIVE_POLYFILL, NativeAdapter } from "./adapters/index.js";
import { streamInto } from "./client.js";
import { serve } from "./http.js";
import { Defer } from "./index.js";

const more = (window: Window) => window.document.querySelector("#more") as unknown as Element;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function page() {
  const window = new Window({
    url: "https://app.example/",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  window.document.body.innerHTML = '<main><p id="more"><a href="/x">2 replies</a></p></main>';
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  window.eval(NATIVE_POLYFILL);
  return window;
}

const respond = (content: () => JSX.Element) =>
  serve(new Request("http://localhost/replies"), content, NativeAdapter, {
    mode: "partial",
    transport: "sse",
    idPrefix: "r-",
  });

const Later = (props: { ms: number; children: JSX.Element }) => async () => {
  await new Promise((r) => setTimeout(r, props.ms));
  return props.children;
};

describe("streamInto", () => {
  it("inserts the content, then fills each placeholder as its patch arrives", async () => {
    const window = page();
    const res = await respond(() => (
      <ul class="replies">
        <Defer fallback={<li>wait 1</li>}>
          {Later({ ms: 20, children: <li id="one">first</li> })}
        </Defer>
        <Defer fallback={<li>wait 2</li>}>
          {Later({ ms: 120, children: <li id="two">second</li> })}
        </Defer>
      </ul>
    ));
    const done = streamInto(more(window), res as never, "afterend");
    await new Promise((r) => setTimeout(r, 60));
    const html = () => window.document.querySelector("main")!.innerHTML;
    expect(html()).toContain("first");
    expect(html()).toContain("wait 2");
    await done;
    await tick();
    expect(window.document.querySelector("#two")?.textContent).toBe("second");
    expect(html()).not.toContain("wait");
    expect(html()).not.toContain("<template");
    expect(html()).not.toContain("<script");
    // the content landed after the link's paragraph, in the main element
    expect(window.document.querySelector("#more + ul.replies")).not.toBeNull();
    window.happyDOM.abort();
  });

  it("carries content that looks like the framing: blank lines, a closing template tag", async () => {
    const window = page();
    const hostile =
      "<p>a</p>\n\n\n<p>b</p><!-- </template> -->\ndata: not a field\n\n<p>&lt;/template&gt;</p>";
    const res = await respond(() => (
      <ul class="replies">
        <Defer fallback={<li>wait</li>}>{async () => <li id="h">{raw(hostile)}</li>}</Defer>
      </ul>
    ));
    await streamInto(more(window), res as never, "afterend");
    await tick();
    const li = window.document.querySelector("#h")!;
    expect(li).not.toBeNull();
    expect(li.innerHTML).toBe(hostile);
    expect(window.document.body.innerHTML).not.toContain("wait");
    window.happyDOM.abort();
  });

  it("splits the stream however the network cuts it", async () => {
    const window = page();
    const res = await respond(() => (
      <ul class="replies">
        <Defer fallback={<li>wait</li>}>{async () => <li id="c">cut</li>}</Defer>
      </ul>
    ));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    await streamInto(
      more(window),
      new Response(body, { headers: { "content-type": "text/event-stream" } }) as never,
    );
    await tick();
    expect(window.document.querySelector("#c")?.textContent).toBe("cut");
    window.happyDOM.abort();
  });

  it("rejects on a response that is not ok, so the caller can follow the link", async () => {
    const window = page();
    const target = more(window);
    await expect(streamInto(target, new Response("no", { status: 500 }) as never)).rejects.toThrow(
      "HTTP 500",
    );
    window.happyDOM.abort();
  });

  it("rejects on a plain HTML response: it is not framed, so it would be mangled", async () => {
    const window = page();
    const html = new Response("<ul><li>page</li></ul>", {
      headers: { "content-type": "text/html" },
    });
    await expect(streamInto(more(window), html as never)).rejects.toThrow("not an event stream");
    expect(window.document.querySelector("li")).toBeNull();
    window.happyDOM.abort();
  });
});
