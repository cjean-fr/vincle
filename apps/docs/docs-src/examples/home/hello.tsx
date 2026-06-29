import { renderToString } from "@vincle/core";

const App = ({ name }: { name: string }) => <h1>Hello, {name}!</h1>;

const html = await renderToString(<App name="world" />);
// → "<h1>Hello, world!</h1>"

export { html };
