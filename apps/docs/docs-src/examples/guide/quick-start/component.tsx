import { renderToString } from "@vincle/core";

function Greeting({ name }: { name: string }) {
  return (
    <p>
      Hello, <strong>{name}</strong>!
    </p>
  );
}

const html = await renderToString(<Greeting name="Alice" />);

export const output = html;
