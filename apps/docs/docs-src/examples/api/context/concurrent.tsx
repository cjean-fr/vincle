import { withScope, setContext, renderToString, type ContextKey } from "@vincle/core";

declare const themeCtx: ContextKey<"light" | "dark">;
const Page = () => <div />;

// Each withScope call is completely isolated
const [lightHtml, darkHtml] = await Promise.all([
  withScope(async () => {
    setContext(themeCtx, "light");
    return renderToString(<Page />);
  }),
  withScope(async () => {
    setContext(themeCtx, "dark");
    return renderToString(<Page />);
  }),
]);
