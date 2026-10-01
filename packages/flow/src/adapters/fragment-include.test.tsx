import { renderToString } from "@vincle/core";
/** @jsxImportSource @vincle/core */
import { describe, expect, it } from "bun:test";

import "../jsx-augment.js";

// JSX here also checks the experimental intrinsic attributes with TypeScript.
describe("WICG Fragment Include JSX", () => {
  it("renders in-place and buffered includes using native attributes", async () => {
    expect(
      await renderToString(
        <template
          src="/partials/header.html"
          for=""
          buffer
          sanitize
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
        />,
      ),
    ).toBe(
      '<template src="/partials/header.html" for="" buffer sanitize crossorigin="anonymous" referrerpolicy="no-referrer"></template>',
    );
    expect(
      await renderToString(
        <template src="/partials/header.html" buffer={false} sanitize="unsafe" />,
      ),
    ).toBe('<template src="/partials/header.html" sanitize="unsafe"></template>');
  });

  it("escapes source URLs and blocks executable URL schemes", async () => {
    expect(await renderToString(<template src={'/fragment?name="&'} />)).toBe(
      '<template src="/fragment?name=&quot;&amp;"></template>',
    );
    // oxlint-disable-next-line @vincle/no-javascript-urls -- exercise the renderer’s URL gate
    expect(await renderToString(<template src="javascript:alert(1)" />)).toBe(
      '<template src="#blocked"></template>',
    );
  });
});
