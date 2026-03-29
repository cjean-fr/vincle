export function createRealWorldPage(jsx) {
  function PurchaseItem({ name, price, quantity }) {
    return jsx("div", {
      class: "purchase purchase-card",
      children: [
        jsx("div", { class: "purchase-name", children: name }),
        jsx("div", { class: "purchase-price", children: price }),
        jsx("div", { class: "purchase-quantity", children: quantity }),
      ],
    });
  }

  function Head({ title }) {
    return jsx("head", {
      children: [
        jsx("meta", {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        }),
        jsx("title", { children: title }),
        jsx("meta", { name: "description", content: "A description" }),
        jsx("meta", { name: "keywords", content: "some, keywords" }),
        jsx("meta", { name: "author", content: "Some Author" }),
        jsx("meta", { name: "twitter:card", content: "summary" }),
        jsx("meta", { name: "twitter:site", content: "@site" }),
        jsx("meta", { name: "twitter:title", content: "Title" }),
        jsx("meta", {
          name: "twitter:description",
          content: "A description",
        }),
        jsx("meta", { name: "twitter:creator", content: "@creator" }),
        jsx("meta", { name: "twitter:image", content: "image.jpg" }),
        jsx("meta", { content: "Title" }),
        jsx("meta", { content: "website" }),
        jsx("link", { rel: "stylesheet", href: "styles.css" }),
        jsx("script", { src: "script.js" }),
        jsx("script", {
          src: "https://cdn.jsdelivr.net/npm/axios-cache-interceptor@1/dev/index.bundle.js",
        }),
        jsx("script", {
          src: "https://cdn.jsdelivr.net/npm/axios-cache-interceptor@1/dist/index.bundle.js",
        }),
      ],
    });
  }

  function Header({ name }) {
    return jsx("header", {
      class: "header",
      children: [
        jsx("h1", { class: "header-title", children: ["Hello ", name] }),
        jsx("nav", {
          class: "header-nav",
          children: jsx("ul", {
            class: "header-ul",
            children: [
              jsx("li", {
                class: "header-item",
                children: jsx("a", { href: "/", children: "Home" }),
              }),
              jsx("li", {
                children: jsx("a", { href: "/about", children: "About" }),
              }),
            ],
          }),
        }),
      ],
    });
  }

  function Footer({ name }) {
    return jsx("footer", {
      class: "footer",
      children: [
        jsx("p", { class: "footer-year", children: ["© ", name] }),
        jsx("p", {
          class: "footer",
          children: [
            jsx("a", { href: "/terms", children: "Terms" }),
            jsx("a", { href: "/privacy", children: "Privacy" }),
          ],
        }),
      ],
    });
  }

  function UserProfile({ name }) {
    return jsx("section", {
      class: "user-profile",
      children: [
        jsx("h2", { class: "user-profile title", children: "User Profile" }),
        jsx("p", {
          class: "user-profile name",
          children: ["Name: ", name],
        }),
        jsx("p", {
          class: "user-profile info",
          children: "Email: example@example.com",
        }),
        jsx("p", {
          class: "user-profile info",
          children: "Address: 123 Main St, City, Country",
        }),
        jsx("p", {
          class: "user-profile info",
          children: "Phone: 123-456-7890",
        }),
      ],
    });
  }

  function Sidebar({ purchases }) {
    return jsx("aside", {
      class: "sidebar",
      children: [
        jsx("h2", { class: "purchase title", children: "Recent Purchases" }),
        jsx("ul", {
          class: "purchase list",
          children: purchases.slice(0, 3).map((purchase) =>
            jsx("li", {
              class: "purchase-preview",
              children: [purchase.name, " - $", purchase.price.toFixed(2)],
            }),
          ),
        }),
      ],
    });
  }

  function PageContent() {
    return jsx("div", {
      class: "page-content",
      children: [
        jsx("h2", {
          class: "title h2 mb-4",
          children: "Welcome to our store",
        }),
        jsx("p", {
          class: "p text mb-0",
          children:
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis magna id dolor ultricies, eget pretium ligula sodales. Cras sit amet turpis nec lacus blandit placerat. Sed vestibulum est sit amet enim ultrices rutrum. Vivamus in nulla vel nunc interdum vehicula.",
        }),
        jsx("p", {
          class: "p text mb-0",
          children:
            "Pellentesque efficitur tellus id velit vehicula laoreet. Proin et neque ac dolor hendrerit elementum. Fusce auctor metus non ligula tincidunt, id gravida odio sollicitudin.",
        }),
      ],
    });
  }

  function Main({ children, name }) {
    return jsx("div", {
      children: [
        jsx(Header, { name }),
        jsx("main", { class: "main-content", children }),
        jsx(Footer, { name }),
      ],
    });
  }

  return function build(name, purchases) {
    return jsx("html", {
      lang: "en",
      children: [
        jsx(Head, { title: "Real World Example" }),
        jsx("body", {
          children: jsx(Main, {
            name,
            children: [
              jsx("h2", { children: "Purchases" }),
              jsx("div", {
                class: "purchases",
                children: purchases.map((purchase) =>
                  jsx(PurchaseItem, {
                    name: purchase.name,
                    price: purchase.price,
                    quantity: purchase.quantity,
                  }),
                ),
              }),
              jsx(UserProfile, { name }),
              jsx(Sidebar, { purchases }),
              jsx(PageContent, {}),
            ],
          }),
        }),
      ],
    });
  };
}
