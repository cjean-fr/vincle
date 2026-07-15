import { Slot, Template, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";
import http from "node:http";

declare function fetchComments(): Promise<{ text: string }[]>;

// Simulate a slow data source
// @ts-expect-error — TS1062: async component returns Promise<VNode>, TS7 detects thenable cycle (runtime OK)
async function Comments() {
  const items = await fetchComments();
  return (
    <ul>
      {items.map((c) => (
        <li>{c.text}</li>
      ))}
    </ul>
  );
}

function Page() {
  return (
    <html>
      <body>
        <h1>My page</h1>
        <Slot name="comments">
          <p>Loading comments…</p>
        </Slot>
        <Template target="comments">{() => <Comments />}</Template>
      </body>
    </html>
  );
}

http
  .createServer(async (_req, res) => {
    const stream = renderToStream(() => <Page />, NativeAdapter);

    // Shell flushes first; deferred fragments follow as they resolve.
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Transfer-Encoding": "chunked",
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
    res.end();
  })
  .listen(3000);

console.log("Listening on http://localhost:3000");
