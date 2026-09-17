import { ExecutionContext, renderToString } from "@vincle/core";

declare function getSession(req: Request): Promise<{ userId: string }>;
const Request = ExecutionContext.key<{ userId: string; locale: string }>("app:request");
const App = () => <main>{ExecutionContext.get(Request).userId}</main>;

async function handleRequest(req: Request): Promise<Response> {
  const session = await getSession(req);
  const html = await ExecutionContext.withScope(() => {
    ExecutionContext.set(Request, {
      userId: session.userId,
      locale: req.headers.get("Accept-Language") ?? "en",
    });
    return renderToString(<App />);
  });
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
