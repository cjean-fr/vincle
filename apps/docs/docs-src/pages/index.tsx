import type { PageMeta } from "../types.js";

import { CodeExample } from "../components/CodeExample.js";

export const meta: PageMeta = {
  title: "JSX for the server",
  description:
    "Compose typed JSX views in your existing server. Add progressive HTML fragments when your page needs them.",
};

const features = [
  {
    title: "Async components",
    description: "Fetch data inside your components. Await the tree. Vincle handles the rendering.",
    href: "/guide/jsx/components",
  },
  {
    title: "HTML escaping",
    description:
      "Content is escaped by default, dangerous URL schemes are blocked, and event handlers stay out of HTML.",
    href: "/guide/security",
  },
  {
    title: "TypeScript support",
    description: "Write components and HTML attributes with TypeScript checking your work.",
    href: "/guide/jsx/elements-attributes",
  },
];

export default function HomePage() {
  return (
    <div class="docs-home">
      <section class="docs-home-hero" aria-labelledby="home-title">
        <div class="docs-hero-copy">
          <div class="docs-product-label">
            <span aria-hidden="true">&lt;/&gt;</span> Server-side JSX renderer
          </div>
          <h1 id="home-title">
            Your views in JSX.
            <br />
            Your app in HTML.
          </h1>
          <p class="docs-hero-description">
            Compose typed, async components in your existing server. Start with an HTML response,
            then let slower parts of the page arrive when they are ready.
          </p>
          <div class="docs-home-actions">
            <a class="docs-button docs-button-primary" href="/guide/getting-started/installation">
              Render your first view
            </a>
            <a class="docs-button docs-button-secondary" href="/integration/streaming">
              Explore streaming
            </a>
          </div>
          <div class="docs-install">
            <span aria-hidden="true">$</span>
            <code>npm install @vincle/core</code>
          </div>
        </div>
        <div class="docs-hero-example">
          <div class="docs-example-heading">
            <span class="docs-example-mark" aria-hidden="true">
              &lt;/&gt;
            </span>
            <span>From JSX to HTML</span>
            <span class="docs-example-language">TypeScript</span>
          </div>
          <CodeExample src="home/hello.tsx" output meta='title="hello.tsx"' />
          <p class="docs-example-note">The rendered output is a plain HTML string.</p>
        </div>
      </section>

      <div class="docs-runtime-strip" aria-label="Supported runtimes">
        <span>Supported runtimes</span>
        <ul>
          <li>Node.js 22+</li>
          <li>Bun</li>
          <li>Deno</li>
          <li>Cloudflare Workers</li>
        </ul>
      </div>

      <section class="docs-home-section" aria-labelledby="use-cases-title">
        <div class="docs-section-heading">
          <h2 id="use-cases-title">
            Start with one view.
            <br />
            Grow with your page.
          </h2>
          <p>Keep your server and routing. Choose how much rendering behavior each page needs.</p>
        </div>
        <div class="docs-use-cases">
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              1
            </span>
            <h3>Compose a view</h3>
            <p>Use functions, typed props, and async data to build reusable HTML components.</p>
            <a class="docs-text-link" href="/guide/getting-started/first-render">
              Write your first component
            </a>
          </article>
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              2
            </span>
            <h3>Return it from a route</h3>
            <p>Render with @vincle/core and send the HTML from your existing HTTP handler.</p>
            <a class="docs-text-link" href="/guide/views">
              Connect a view to your server
            </a>
          </article>
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              3
            </span>
            <h3>Defer the slow parts</h3>
            <p>
              Add @vincle/flow to send the page shell first, then deliver deferred HTML fragments.
            </p>
            <a class="docs-text-link" href="/integration/streaming">
              Stream a fragment
            </a>
          </article>
        </div>
      </section>

      <section class="docs-home-section docs-foundations" aria-labelledby="streaming-title">
        <div>
          <h2 id="streaming-title">The page can arrive before the results.</h2>
          <p>
            Keep the heading visible while an async component loads. With flow, a fallback fills the
            space until its HTML is ready.
          </p>
          <p>
            Choose an adapter for delivery, including HTMX or Turbo. Browser updates use the chosen
            adapter’s client mechanism.
          </p>
          <a class="docs-text-link" href="/guide/views">
            Follow the complete example
          </a>
        </div>
        <div class="docs-hero-example">
          <CodeExample src="home/deferred.tsx" meta='title="results-page.tsx"' />
          <p class="docs-example-note">
            The Results component stays the same. The page opts into deferred rendering.
          </p>
        </div>
      </section>

      <section class="docs-home-section docs-foundations" aria-labelledby="features-title">
        <div>
          <h2 id="features-title">Built into the renderer.</h2>
          <p>Typed views, predictable rendering, and explicit HTML boundaries.</p>
          <a class="docs-text-link" href="https://github.com/cjean-fr/vincle">
            View source on GitHub
          </a>
        </div>
        <div class="docs-feature-list">
          {features.map((feature) => (
            <a href={feature.href} class="docs-feature-link">
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
      <footer class="docs-home-footer">
        <span>Vincle — JSX for the server.</span>
        <a href="https://www.npmjs.com/package/@vincle/core">Available on npm</a>
        <a href="https://github.com/cjean-fr/vincle/blob/main/LICENSE">MIT licensed</a>
      </footer>
    </div>
  );
}
