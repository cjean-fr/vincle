import { renderToString } from "@vincle/core";

import { Results } from "./results";

// Call this handler from your server's routing layer.
export async function GET() {
  const html = await renderToString(
    <main>
      <h1>Search results</h1>
      <Results />
    </main>,
  );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
