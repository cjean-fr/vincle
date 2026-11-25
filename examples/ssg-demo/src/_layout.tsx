import type { JSX } from "@vincle/core";
import type { SsgMeta } from "@vincle/ssg";

export default function Layout({ children, meta }: { children: JSX.Element; meta: SsgMeta }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{meta.title}</title>
      </head>
      <body>
        <nav>
          <a href="/">Home</a> | <a href="/about">About</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
