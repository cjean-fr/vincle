import { Slot, Template, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

declare function fetchComments(): Promise<{ text: string }[]>;

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

// <Slot> declares the placeholder with fallback content in the shell.
// <Template> pushes the real content, which replaces it when resolved.
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

// The shell is sent immediately; deferred fragments stream
// in as they resolve. NativeAdapter injects a ~550 B polyfill.
const stream = renderToStream(() => <Page />, NativeAdapter);
