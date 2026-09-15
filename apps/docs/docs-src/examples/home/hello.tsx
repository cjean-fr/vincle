import { renderToString } from "@vincle/core";

function App({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

const page = <App name="world" />;
const html = await renderToString(page);

export const output = html;
