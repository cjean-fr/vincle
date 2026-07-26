import { Slot, Template } from "@vincle/flow";
import type { VNode } from "@vincle/core";

async function LiveComments() {
  const res = await fetch("https://api.example.com/comments");
  const comments: Array<{ id: string; text: string }> = await res.json();
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  );
}

function Page() {
  return (
    <html>
      <body>
        <Slot name="comments">
          <p>Loading comments…</p>
        </Slot>

        <Template target="comments" timeout={5000}>
          {
            // @ts-expect-error Async component supported at runtime
            <LiveComments /> as unknown as VNode
          }
        </Template>
      </body>
    </html>
  );
}
