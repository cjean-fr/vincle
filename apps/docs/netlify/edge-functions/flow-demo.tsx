/** @jsxImportSource npm:@vincle/core@0.10.0 */
import { Defer, renderToStream } from "npm:@vincle/flow@0.12.0";
import { NativeAdapter } from "npm:@vincle/flow@0.12.0/adapters";

/**
 * Live demo embedded in the Flow overview (/integration/flow/overview).
 * Served as a full page at /flow-demo so the browser shows the shell arriving
 * first and the deferred results patching in, on every load. The code mirrors
 * the page's example fence; tests/flow-demo.test.tsx checks the same wire.
 */
async function findResults() {
  // Artificial latency so the patch is visible to a human eye.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return [
    { title: "Getting started", href: "/guide/getting-started/installation" },
    { title: "Building a static site", href: "/guide/getting-started/first-site" },
  ];
}

async function Results() {
  const items = await findResults();
  return (
    <ul>
      {items.map((item) => (
        <li>
          <a href={item.href}>{item.title}</a>
        </li>
      ))}
    </ul>
  );
}

function Page() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Flow live demo</title>
        <style>{`
          body {
            margin: 0;
            padding: 0.9rem 1.1rem 1.1rem;
            font-family: system-ui, sans-serif;
            font-size: 0.85rem;
            color: #0f172a;
            background: #ffffff;
          }
          h3 {
            margin: 0 0 0.55rem;
            font-size: 1.02rem;
            letter-spacing: -0.01em;
          }
          p {
            margin: 0;
            color: #475569;
          }
          ul {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
          }
          li a {
            display: inline-block;
            padding: 0.45rem 0.75rem;
            border: 1px solid #e2e8f0;
            border-radius: 0.45rem;
            color: #1d4ed8;
            text-decoration: none;
            font-weight: 500;
          }
          @media (prefers-color-scheme: dark) {
            body { color: #e2e8f0; background: #0b1220; }
            p { color: #94a3b8; }
            li a { border-color: #334155; color: #93c5fd; }
          }
        `}</style>
      </head>
      <body>
        <h3>Search results</h3>
        <Defer fallback={<p>Loading results…</p>}>
          <Results />
        </Defer>
      </body>
    </html>
  );
}

export default function handler(_req: Request): Response {
  const stream = renderToStream(() => <Page />, NativeAdapter);
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
