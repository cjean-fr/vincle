import { Scope, renderToString } from "@vincle/core";

declare function getSession(req: Request): Promise<{ userId: string }>;
const Request = Scope.key<{ userId: string; locale: string }>("app:request");
const App = () => <main>{Scope.get(Request).userId}</main>;

async function handleRequest(req: Request): Promise<Response> {
  const session = await getSession(req);
  const html = await Scope.with(() => {
    Scope.set(Request, {
      userId: session.userId,
      locale: req.headers.get("Accept-Language") ?? "en",
    });
    return renderToString(<App />);
  });
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
