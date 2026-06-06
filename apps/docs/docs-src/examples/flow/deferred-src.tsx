import { Include } from "@vincle/flow";

// The browser fetches /fragments/comments.html after the shell lands.
// No server-push needed — works with any static file server.
function Page() {
  return (
    <html>
      <body>
        <Include src="/fragments/comments.html" />
      </body>
    </html>
  );
}
