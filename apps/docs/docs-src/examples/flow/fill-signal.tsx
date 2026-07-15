import { Slot, Template } from "@vincle/flow";

async function LiveComments({ signal }: { signal: AbortSignal }) {
  const res = await fetch("https://api.example.com/comments", {
    signal,
  });
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

        {/*
          The factory receives an AbortSignal tied to
          the request lifetime. Pass it to fetch() so
          a client disconnect cancels the pending HTTP
          call automatically — no orphaned work.
        */}
        <Template target="comments" timeout={5000}>
          {(signal) => <LiveComments signal={signal} />}
        </Template>
      </body>
    </html>
  );
}
