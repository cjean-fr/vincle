import { renderToString } from "@vincle/core";

const Page = ({ title }: { title: string }) => (
  <html>
    <head>
      <title>{title}</title>
    </head>
    <body>
      <h1>{title}</h1>
    </body>
  </html>
);

const html = await renderToString(<Page title="My Site" />);
