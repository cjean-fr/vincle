import { renderToString } from "@vincle/core";

const App = ({ name }: { name: string }) => <h1>Hello, {name}!</h1>;

const html = await renderToString(<App name="world" />);

export const output = html;
