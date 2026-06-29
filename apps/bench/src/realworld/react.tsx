/** @jsxImportSource react */
import type { Purchase } from "./data.js";
import { renderToStaticMarkup } from "react-dom/server";

function Purchase({ name, price, quantity }: Purchase) {
  return (
    <div className="purchase purchase-card">
      <div className="purchase-name">{name}</div>
      <div className="purchase-price">{price}</div>
      <div className="purchase-quantity">{quantity}</div>
    </div>
  );
}

function Layout({ children, head }: any) {
  return (
    <html lang="en">
      {head}
      <body>{children}</body>
    </html>
  );
}

function Head({ title }: { title: string }) {
  return (
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>
      <meta name="description" content="A description" />
      <meta name="keywords" content="some, keywords" />
      <meta name="author" content="Some Author" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:site" content="@site" />
      <meta name="twitter:title" content="Title" />
      <meta name="twitter:description" content="A description" />
      <meta name="twitter:creator" content="@creator" />
      <meta name="twitter:image" content="image.jpg" />
      <meta content="Title" />
      <meta content="website" />
      <link rel="stylesheet" href="styles.css" />
      <script src="script.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios-cache-interceptor@1/dev/index.bundle.js" />
      <script src="https://cdn.jsdelivr.net/npm/axios-cache-interceptor@1/dist/index.bundle.js" />
    </head>
  );
}

function Header({ name }: { name: string }) {
  return (
    <header className="header">
      <h1 className="header-title">Hello {name}</h1>
      <nav className="header-nav">
        <ul className="header-ul">
          <li className="header-item">
            <a href="/">Home</a>
          </li>
          <li>
            <a href="/about">About</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function Footer({ name }: { name: string }) {
  return (
    <footer className="footer">
      <p className="footer-year">© {name}</p>
      <p className="footer">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </p>
    </footer>
  );
}

function Main({ children, name }: any) {
  return (
    <div>
      <Header name={name} />
      <main className="main-content">{children}</main>
      <Footer name={name} />
    </div>
  );
}

function UserProfile({ name }: { name: string }) {
  return (
    <section className="user-profile">
      <h2 className="user-profile title">User Profile</h2>
      <p className="user-profile name">Name: {name}</p>
      <p className="user-profile info">Email: example@example.com</p>
      <p className="user-profile info">Address: 123 Main St, City, Country</p>
      <p className="user-profile info">Phone: 123-456-7890</p>
    </section>
  );
}

function Sidebar({ purchases }: { purchases: Purchase[] }) {
  return (
    <aside className="sidebar">
      <h2 className="purchase title">Recent Purchases</h2>
      <ul className="purchase list">
        {purchases.slice(0, 3).map((purchase, i) => (
          <li className="purchase-preview" key={i}>
            {purchase.name} - ${purchase.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function PageContent() {
  return (
    <div className="page-content">
      <h2 className="title h2 mb-4">Welcome to our store</h2>
      <p className="p text mb-0">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis
        magna id dolor ultricies, eget pretium ligula sodales. Cras sit amet
        turpis nec lacus blandit placerat. Sed vestibulum est sit amet enim
        ultrices rutrum. Vivamus in nulla vel nunc interdum vehicula.
      </p>
      <p className="p text mb-0">
        Pellentesque efficitur tellus id velit vehicula laoreet. Proin et neque
        ac dolor hendrerit elementum. Fusce auctor metus non ligula tincidunt,
        id gravida odio sollicitudin.
      </p>
    </div>
  );
}

function RealWorldPage(name: string, purchases: Purchase[]) {
  return (
    <Layout head={<Head title="Real World Example" />}>
      <Main name={name}>
        <h2>Purchases</h2>
        <div className="purchases">
          {purchases.map((purchase, i) => (
            <Purchase
              key={i}
              name={purchase.name}
              price={purchase.price}
              quantity={purchase.quantity}
            />
          ))}
        </div>
        <UserProfile name={name} />
        <Sidebar purchases={purchases} />
        <PageContent />
      </Main>
    </Layout>
  );
}

export const render = (name: string, purchases: Purchase[]): string =>
  renderToStaticMarkup(RealWorldPage(name, purchases));
