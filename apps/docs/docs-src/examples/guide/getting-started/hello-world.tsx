import { renderToString } from "@vincle/core";

const html = await renderToString(
  <html lang="en">
    <head>
      <title>Hello, world!</title>
    </head>
    <body>
      <h1>Hello, world!</h1>
    </body>
  </html>,
);
// → "<html lang=\"en\"><head><title>Hello, world!</title></head><body><h1>Hello, world!</h1></body></html>"
