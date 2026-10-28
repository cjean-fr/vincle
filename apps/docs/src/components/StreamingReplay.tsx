import { raw } from "@vincle/core";
import { Defer, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

/**
 * The home page's results-page.tsx fence shows the Page and stream of this
 * code, and the replay below renders what it actually emits: the shell with
 * its fallback, then the patch that replaces it. Nothing here is a mockup.
 */
async function findResults() {
  return [{ title: "Getting started", href: "/guide/getting-started/installation" }];
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
    <main>
      <h1>Search results</h1>
      <Defer fallback={<p>Loading results…</p>}>
        <Results />
      </Defer>
    </main>
  );
}

async function captureWire(): Promise<string> {
  const stream = renderToStream(() => <Page />, NativeAdapter);
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

export default async function StreamingReplay() {
  const wire = await captureWire();
  const shell = /<main>[\s\S]*?<\/main>/.exec(wire)?.[0] ?? "";
  const patches = [...wire.matchAll(/<template data-for="([^"]+)">([\s\S]*?)<\/template>/g)];
  let after = shell;
  for (const patch of patches) {
    const id = patch[1] ?? "";
    const content = patch[2] ?? "";
    after = after.replace(new RegExp(`<\\?start name="${id}">[\\s\\S]*?<\\?end>`), content);
  }
  return (
    <div class="docs-stream-replay">
      <div class="docs-stream-stage">
        <p class="docs-stream-label">{"1 · The shell arrives first"}</p>
        <div class="docs-stream-frame">
          <div class="docs-stream-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div class="docs-stream-view">{raw(shell)}</div>
        </div>
      </div>
      <div class="docs-stream-stage">
        <p class="docs-stream-label">{"2 · The patch replaces the fallback"}</p>
        <div class="docs-stream-frame">
          <div class="docs-stream-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div class="docs-stream-view">{raw(after)}</div>
        </div>
      </div>
      <details class="docs-stream-wire">
        <summary>{"The patch, as sent on the wire"}</summary>
        <pre>
          <code>{patches.map((patch) => patch[0]).join("\n")}</code>
        </pre>
      </details>
    </div>
  );
}
