import { ErrorBoundary, renderToString, raw } from "./index.js";
import { describe, it, expect } from "bun:test";

describe("ErrorBoundary", () => {
  it("catches a thrown error and renders fallback JSX", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>fallback</p>");
  });

  it("catches an error from a deeply nested component", async () => {
    function Inner(): never {
      throw new Error("deep");
    }
    function Outer({ children }: { children?: any }) {
      return <div>{children}</div>;
    }
    const html = await renderToString(
      <ErrorBoundary fallback={<span>recouvere</span>}>
        <Outer>
          <Inner />
        </Outer>
      </ErrorBoundary>,
    );
    expect(html).toBe("<span>recouvere</span>");
  });

  it("fallback function receives the caught error", async () => {
    function Boom(): never {
      throw new Error("broken-part");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={(e) => <p>Error: {(e as Error).message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>Error: [Boom] broken-part</p>");
  });

  it("fallback can return a RawString", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={raw("<b>trusted</b>")}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(html).toBe("<b>trusted</b>");
  });

  it("nested boundary — inner catches before outer", async () => {
    function Boom(): never {
      throw new Error("inner-boom");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={<p>outer</p>}>
        <ErrorBoundary fallback={<p>inner</p>}>
          <Boom />
        </ErrorBoundary>
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>inner</p>");
  });

  it("outer boundary catches when inner boundary has string fallback and error is deeper", async () => {
    function Boom(): never {
      throw new Error("deep-boom");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={<p>outer-caught</p>}>
        <ErrorBoundary fallback={<p>inner-only</p>}>
          <div>
            <Boom />
          </div>
        </ErrorBoundary>
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>inner-only</p>");
  });

  it("normal children render without error", async () => {
    const html = await renderToString(
      <ErrorBoundary fallback={<p>fail</p>}>
        <span>ok</span>
      </ErrorBoundary>,
    );
    expect(html).toBe("<span>ok</span>");
  });

  it("passes through when no children", async () => {
    const html = await renderToString(<ErrorBoundary fallback={<p>fail</p>} />);
    expect(html).toBe("");
  });

  it("catches async component error", async () => {
    async function AsyncBoom() {
      await Promise.resolve();
      throw new Error("async-boom");
    }
    const html = await renderToString(
      <ErrorBoundary fallback={(e) => <p>{(e as Error).message}</p>}>
        <AsyncBoom />
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>[AsyncBoom] async-boom</p>");
  });

  it("catches rejection from a Promise child", async () => {
    const html = await renderToString(
      <ErrorBoundary fallback={<p>caught-promise</p>}>
        {Promise.reject(new Error("rejected"))}
      </ErrorBoundary>,
    );
    expect(html).toBe("<p>caught-promise</p>");
  });
});
