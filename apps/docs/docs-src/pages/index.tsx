import type { PageMeta } from "../types.js";

import { CodeExample } from "../components/CodeExample.js";

export const meta: PageMeta = {
  title: "JSX for the server",
  description:
    "Typed, async-native JSX rendering for email templates, API responses, and static sites.",
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
            Render JSX.
            <br />
            Return HTML.
          </h1>
          <p class="docs-hero-description">
            Typed, async-native JSX for the server. Turn components into HTML for emails, API
            responses, and static sites.
          </p>
          <div class="docs-home-actions">
            <a class="docs-button docs-button-primary" href="/guide/introduction">
              Get started
            </a>
            <a class="docs-button docs-button-secondary" href="/api/core/renderToString">
              Explore the API
            </a>
          </div>
          <div class="docs-install">
            <span aria-hidden="true">$</span>
            <code>bun add @vincle/core</code>
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
            HTML for emails,
            <br />
            responses, and pages.
          </h2>
          <p>Use JSX wherever you need HTML. Keep the tools and server you already know.</p>
        </div>
        <div class="docs-use-cases">
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              @
            </span>
            <h3>Email templates</h3>
            <p>
              Compose typed, reusable templates. Render the HTML and pass it to your email provider.
            </p>
          </article>
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              &lt;/&gt;
            </span>
            <h3>API responses</h3>
            <p>Fetch your data with async components and return HTML straight from your server.</p>
          </article>
          <article>
            <span class="docs-use-case-symbol" aria-hidden="true">
              #
            </span>
            <h3>Static sites</h3>
            <p>Generate pages at build time. Ship HTML with no client-side rendering runtime.</p>
          </article>
        </div>
      </section>

      <section class="docs-home-section docs-foundations" aria-labelledby="features-title">
        <div>
          <h2 id="features-title">Built into the renderer.</h2>
          <p>A focused core with the essentials built in.</p>
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
