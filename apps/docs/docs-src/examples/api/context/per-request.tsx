import { context, withScope, setContext, renderToString } from "@vincle/core";

declare function getSession(req: Request): Promise<{ userId: string }>;
const App = () => <div />;

// Per-request context injection in an HTTP server
const requestCtx = context<{ userId: string; locale: string }>(
  "my-app:request",
);

async function handleRequest(req: Request): Promise<Response> {
  const session = await getSession(req);

  const html = await withScope(async () => {
    setContext(requestCtx, {
      userId: session.userId,
      locale: req.headers.get("Accept-Language") ?? "en",
    });
    return renderToString(<App />);
  });

  return new Response("<!DOCTYPE html>\n" + html, {
    headers: { "Content-Type": "text/html" },
  });
}
