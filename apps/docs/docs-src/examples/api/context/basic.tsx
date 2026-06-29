import {
  type VincleNode,
  context,
  setContext,
  useContext,
  withScope,
  renderToString,
} from "@vincle/core";

// 1. Define a typed context key (module-level singleton)
const themeCtx = context<"light" | "dark">("my-app:theme");

// 2. A component that reads from context
function ThemedBox({ children }: { children: VincleNode }): VincleNode {
  const theme = useContext(themeCtx);
  return (
    <div
      class={
        theme === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      }
    >
      {children}
    </div>
  );
}

// 3. Render inside a scope that provides the value
const html = await withScope(async () => {
  setContext(themeCtx, "dark");
  return renderToString(<ThemedBox>Hello</ThemedBox>);
});
