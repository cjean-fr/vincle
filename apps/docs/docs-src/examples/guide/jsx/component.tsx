import { renderToString, type VNode } from "@vincle/core";

function Layout({ title, children }: { title: string; children: VNode }) {
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}

const html = await renderToString(
  <Layout title="My page">
    <h1>Welcome</h1>
    <p>This is a page rendered with Vincle.</p>
  </Layout>,
);
