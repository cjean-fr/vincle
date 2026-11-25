import { Defer, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";
import { createServer } from "node:http";
import { Readable } from "node:stream";

// Pretend these are slow queries. Each one resolves on its own schedule.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function Weather() {
  await wait(1000);
  return <p>Paris: 12°C, light rain.</p>;
}

async function Headlines() {
  await wait(2500);
  return (
    <ul>
      <li>The shell arrived before anything else.</li>
      <li>Each block lands as soon as it is ready.</li>
      <li>No client framework, no hydration.</li>
    </ul>
  );
}

function Page() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Vincle Flow demo</title>
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; }
          section { border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 0.75rem 1rem; margin: 1rem 0; }
          h2 { margin: 0 0 0.5rem; font-size: 1rem; }
          p, ul { margin: 0; }
          .loading { color: #64748b; }
        `}</style>
      </head>
      <body>
        <h1>Vincle Flow</h1>
        <p>This heading is sent at once. Reload to watch the blocks below arrive.</p>
        <section>
          <h2>Weather (about 1 s)</h2>
          <Defer fallback={<p class="loading">Loading weather…</p>}>
            <Weather />
          </Defer>
        </section>
        <section>
          <h2>Headlines (about 2.5 s)</h2>
          <Defer fallback={<p class="loading">Loading headlines…</p>}>
            <Headlines />
          </Defer>
        </section>
      </body>
    </html>
  );
}

const port = Number(process.env.PORT ?? 4321);

createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/index.html") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const stream = renderToStream(() => <Page />, NativeAdapter).pipeThrough(new TextEncoderStream());
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  Readable.fromWeb(stream as never).pipe(res);
}).listen(port, () => {
  console.log(`Flow demo: http://localhost:${port}/`);
});
