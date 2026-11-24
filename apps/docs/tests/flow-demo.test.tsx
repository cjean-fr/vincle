import { Defer, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";
import { it, expect } from "bun:test";

/**
 * The /flow-demo Edge Function (netlify/edge-functions/flow-demo.tsx) runs on
 * Deno and imports the published npm packages, which Bun cannot resolve. This
 * mirrors its page with the workspace packages and checks the wire contract
 * the demo relies on: shell with its fallback first, patch second.
 * Keep the two in sync when the demo changes.
 */
async function findResults() {
  await new Promise((resolve) => setTimeout(resolve, 20));
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
      <body>
        <h3>Search results</h3>
        <Defer fallback={<p>Loading results…</p>}>
          <Results />
        </Defer>
      </body>
    </html>
  );
}

it("sends the shell with its fallback before the deferred results patch", async () => {
  const stream = renderToStream(() => <Page />, NativeAdapter);
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  expect(chunks.length).toBeGreaterThanOrEqual(2);
  const shell = chunks[0]!;
  const rest = chunks.slice(1).join("");
  // Shell: the fallback is in place, the results are not there yet.
  expect(shell).toContain("Search results");
  expect(shell).toContain("Loading results…");
  expect(shell).not.toContain("Getting started");
  // Later: a patch carries the results for the placeholder.
  expect(rest).toContain("<template data-for=");
  expect(rest).toContain("Getting started");
  expect(rest).toContain("/guide/getting-started/first-site");
});
