import { createContext, useContext, renderToString } from "@vincle/core";

const Theme = createContext<"light" | "dark">("light");

function ThemedBox({ children }: { children: string }) {
  const theme = useContext(Theme);
  return <div class={theme === "dark" ? "dark" : "light"}>{children}</div>;
}

const html = await renderToString(
  <Theme.Provider value="dark">
    <ThemedBox>Hello</ThemedBox>
  </Theme.Provider>,
);
