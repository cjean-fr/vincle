---
name: @vincle/core
description: Use this skill when the user wants to render JSX to HTML strings, create static sites (SSG), build email templates, generate HTML strings on the server without using React runtime or client-side hydration, generate PDF content, or needs secure HTML rendering with escaped content. Trigger on JSX-to-string tasks, email template generation, server-side rendering without React, or static site generation.
license: MIT
compatibility: Node.js, Bun, Deno, Vite, esbuild, TypeScript
---

# @vincle/core

Async-first JSX-to-HTML renderer with built-in XSS protection and concurrent-safe context. Zero runtime dependencies.

## Install

```bash
npm install @vincle/core
```

Element attributes are typed per element out of the box (the table ships in
`@vincle/core`, generated from `@types/react` + `csstype`), so `<dvi clas="x">`
is a compile error. Nothing is imported from React at runtime.

Attribute names use camelCase spelling (`className`, `tabIndex`,
`strokeWidth`); the engine maps each one to its HTML name (`class`, `tabindex`,
`stroke-width`). Hyphenated and namespaced names (`data-*`, `aria-*`,
`http-equiv`, `xlink:href`) can be written directly.

## Quick Setup

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vincle/core"
  }
}
```

Vite / esbuild:

<!-- skip-typecheck -->

```ts
esbuild: {
  jsx: "automatic",
  jsxImportSource: "@vincle/core",
}
```

## Decision Tree

If the request is unclear, ask one clarifying question.

| Need                                                  | Use                                                       |
| ----------------------------------------------------- | --------------------------------------------------------- |
| HTML strings only                                     | `renderToString()`                                        |
| Component itself must await data before returning JSX | async components                                          |
| Shared state in the render tree                       | `createContext()` + `<Context.Provider>` + `useContext()` |
| Mutable state for one async execution                 | `Scope`                                                   |
| DOM streaming, islands, or browser patching           | `@vincle/flow`                                            |

If the user wants browser DOM updates, hydration, hooks, event handlers, or client-side interactivity, do not use this package for that task; explain that `@vincle/core` is for HTML-string generation and server-side rendering only.

## Core API

```typescript
import { renderToString, raw } from "@vincle/core";

// renderToString ALWAYS returns Promise<string>: even for sync components
const plain = await renderToString(<div>Hello</div>);

// Trusted HTML: bypasses escaping. Never use raw() or dangerouslySetInnerHTML with untrusted input.
const trusted = await renderToString(<div>{raw("<b>Bold</b>")}</div>);

// Or via dangerouslySetInnerHTML with pre-sanitized content only
const sameThing = await renderToString(
  <div dangerouslySetInnerHTML={{ __html: "<b>Bold</b>" }} />,
);
```

> **Tree Providers need no outer scope.** Use `Scope.with()` only for execution-scoped mutable state. Concurrent Provider renders remain isolated.

## Async Patterns

Every component can be `async`. A promise is awaited wherever one can appear: a
child, a component's return value, an array element, an attribute _value_,
`dangerouslySetInnerHTML.__html`, or an async iterable.

**Components execute in document order.** A sibling starts once the one to its left
is done, so what renders before you in the markup ran before you, and the rendered
document never depends on how long any component took. To overlap independent I/O,
either `await Promise.all` inside one component (below), or use `<Defer>` /
`<Slot>` from `@vincle/flow`, which puts the boundary in the markup.

```tsx
// ✅ Async component: await inside, return JSX
const UserCard = async ({ id }: { id: string }) => {
  const user = await fetchUser(id);
  return <div>{user.name}</div>;
};

// ✅ Parallel fetches for independent data
const Dashboard = async ({ userId }: { userId: string }) => {
  const [user, posts] = await Promise.all([fetchUser(userId), fetchPosts(userId)]);
  return (
    <div>
      {user.name}: {posts.length} posts
    </div>
  );
};

// ✅ Promise as child: resolved automatically
const resolved = await renderToString(<div>{Promise.resolve("async text")}</div>);
// => <div>async text</div>

// ❌ Rendering a Promise without await on renderToString: will hang.
// It returns a Promise<string>; the caller must await it, never treat it as a string.
const notHtml = renderToString(<AsyncComponent />); // missing await
```

## Context API

Create a typed tree context once. The nearest Provider supplies a value to its
descendants; outside one, `useContext` returns the declared default. Concurrent
renders stay isolated across `await`.

The surface matches React 19: the context object **is** the provider
(`AuthContext.Provider === AuthContext`), and `AuthContext.Consumer` is the
render-prop reader. The default is the `createContext` argument, not a property.

```ts
export const AuthContext = createContext({ user: "Guest", locale: "en" });
```

```tsx
// Read it under a Provider: the context itself, or its .Provider alias
const Header = () => {
  const { user, locale } = useContext(AuthContext);
  return <header lang={locale}>Hello {user}</header>;
};

const html = await renderToString(
  <AuthContext.Provider value={{ user: "Alice", locale: "fr" }}>
    <Header />
  </AuthContext.Provider>,
);

// The render-prop form
const html2 = await renderToString(
  <AuthContext.Consumer>{({ user }) => <span>{user}</span>}</AuthContext.Consumer>,
);
```

Use `Scope` for mutable per-request data that a plain helper or a
later sibling must read. Its `get` throws if no scope or value is present.

### Sub-scopes with snapshot

```ts
const Request = Scope.key<{ user: string }>("app:request");
await Scope.with(async () => {
  Scope.set(Request, { user: "Alice" });

  // Child scope inherits parent data via snapshot(), passed as-is,
  // the second argument IS the ScopeMap, not an options object.
  await Scope.with(async () => {
    Scope.get(Request).user; // ✅ "Alice"
    Scope.set(Request, { user: "Child" }); // local only
  }, Scope.snapshot());

  Scope.get(Request).user; // ✅ still "Alice"
});
```

### Multiple context tokens

Each feature declares its own tree Context.

```tsx
export const AuthContext = createContext({ userId: "anonymous" });
export const ThemeContext = createContext({ dark: false });

await renderToString(
  <AuthContext.Provider value={{ userId: "42" }}>
    <ThemeContext.Provider value={{ dark: true }}>
      <App />
    </ThemeContext.Provider>
  </AuthContext.Provider>,
);
```

## Migration from React

| React pattern                  | @vincle/core equivalent                              |
| ------------------------------ | ---------------------------------------------------- |
| `useState`, `useEffect`        | Fetch data before render, pass as props              |
| `createContext` / `<Provider>` | `createContext(defaultValue)` + `<Context.Provider>` |
| Event handler functions        | String values only (`onClick="alert(1)"`)            |
| `ref`                          | Not supported                                        |
| `className`                    | Both `class` and `className` accepted                |

<!-- skip-typecheck: React, not vincle -->

```tsx
// React: hooks + useEffect
const Page = () => {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(fetchData());
  }, []);
  return data ? <Content data={data} /> : <Loading />;
};
```

```tsx
// @vincle/core: async component
const Page = async () => {
  const data = await fetchData();
  return <Content data={data} />;
};
```

## SSG Pattern

```typescript
import { renderToString } from "@vincle/core";
import { mkdir, writeFile } from "fs/promises";

const routes = [
  { path: "/", component: <HomePage /> },
  { path: "/about", component: <AboutPage /> },
];

await Promise.all(
  routes.map(async ({ path, component }) => {
    const html = await renderToString(component);
    const file = path === "/" ? "dist/index.html" : `dist${path}/index.html`;
    await mkdir(file.replace(/\/[^/]+$/, ""), { recursive: true });
    await writeFile(file, `<!DOCTYPE html>${html}`);
  }),
);
```

## Security (Built-in)

No opt-in required: output is OWASP-aligned by default when content is escaped. `raw()` and `dangerouslySetInnerHTML` bypass escaping and must only be used with pre-sanitized, trusted HTML. If the input is untrusted, refuse to use `raw()` or `dangerouslySetInnerHTML` and explain that escaping is required to keep the output safe.

```tsx
// Text content escaped
<div>{"<script>alert(1)</script>"}</div>;
// => <div>&lt;script&gt;alert(1)&lt;/script&gt;</div>

// javascript: blocked in URL attributes
<a href="javascript:alert(1)">link</a>;
// => <a href="#blocked">link</a>
```

String event handlers are supported. A function value **throws**. It is not
dropped, and there is no warning: a function cannot be serialized to HTML, and
TypeScript refuses it before the renderer ever sees it.

<!-- skip-typecheck: the second line is a type error on purpose -->

```tsx
<button onClick="alert(1)">btn</button>; // ✅ onclick="alert(1)"
<button onClick={fn}>btn</button>; // ❌ throws
```

`raw()` and `dangerouslySetInnerHTML` are the trust boundary, and it has two
sides worth knowing:

```tsx
// In content position, raw() is verbatim: that is the whole point.
<div>{raw(sanitizedHtml)}</div>;

// In ATTRIBUTE position it is verbatim except `"`, which is escaped so a value
// can never end the attribute and reopen the tag. Sanitized *HTML* is still not
// an attribute value: it belongs in content, not in a title.
<a title={raw('say "hi"')}>x</a>; // title="say &quot;hi&quot;"

// A URL attribute holding a RawString skips the scheme check by design:
// raw() means "I vouch for this", javascript: included.
<a href={raw(url)}>x</a>; // no #blocked here
```

## Inline `<script>` and `<style>`

Children of `<script>` and `<style>` are **not** HTML-escaped. They reach the
JavaScript and CSS engines as written. Only the sequence that would end the
element is neutralised, in the form the sub-language reads back
(`\u003c/script>`, `<\/style>`), so real code and JSON data blocks need no
`raw()`.

```tsx
// ✅ Real JavaScript, untouched except where it would close the element
<script>{`document.querySelector("#app").dataset.ready = "1";`}</script>;

// ✅ A JSON data block stays parseable whatever the data holds
<script type="application/ld+json">{JSON.stringify({ name: title })}</script>;

// ✅ Real CSS
<style>{`.card { color: red }`}</style>;
```

Two things that rule does **not** do:

```tsx
// ❌ Untrusted data concatenated into JS source is still an injection: the quote
// ends the string, `;` starts a statement. Rawtext escaping protects the HTML
// boundary, not the JavaScript one.
<script>{`const name = "${user.name}";`}</script>;

// ✅ Serialize instead. JSON.stringify escapes the quote, and the rawtext rule
// handles a `</script>` inside the value.
<script>{`const name = ${JSON.stringify(user.name)};`}</script>;

// ❌ dangerouslySetInnerHTML turns the protection off entirely. It is the React
// idiom for inline scripts *because React escapes script children*; vincle does
// not, so the plain child form above is both simpler and safer.
<script dangerouslySetInnerHTML={{ __html: code }} />;
```

## ESLint Plugin

```bash
npm install -D @vincle/eslint-plugin
```

```js
// eslint.config.js
import jsxString from "@vincle/eslint-plugin";

export default [jsxString.configs.recommended];
```

Rules included: `no-react-hooks`, `no-react-imports`, `no-context` (React context), `no-refs`, `no-javascript-urls`, `no-unsafe-event-handlers`.

## Testing

```typescript
// @jsxImportSource @vincle/core
import { describe, it, expect } from "bun:test";
import {
  renderToString,
  createContext,
  useContext,
} from "@vincle/core";

describe("Component", () => {
  it("renders correctly", async () => {
    const html = await renderToString(<div>Hello</div>);
    expect(html).toBe("<div>Hello</div>");
  });

  it("escapes HTML", async () => {
    const html = await renderToString(<div>{"<script>"}</div>);
    expect(html).toBe("<div>&lt;script&gt;</div>");
  });

  it("renders with context", async () => {
    const Ctx = createContext({ user: "Guest" });
    const Greeting = () => <span>{useContext(Ctx).user}</span>;

    const html = await renderToString(
      <Ctx.Provider value={{ user: "Alice" }}><Greeting /></Ctx.Provider>,
    );
    expect(html).toBe("<span>Alice</span>");
  });
});
```

## Troubleshooting

| Problem                            | Solution                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| TypeScript errors on JSX           | Check `tsconfig.json` has `"jsxImportSource": "@vincle/core"`                      |
| `[object Promise]` in output       | Missing `await` on `renderToString()`                                              |
| `Scope.get` throws                 | Enter `Scope.with()` and set the key first                                         |
| Style not applied                  | Use camelCase: `borderTopColor`, not `border-top-color`                            |
| `class` not working                | Both `class` and `className` are accepted                                          |
| JSX in test file not resolved      | Add `// @jsxImportSource @vincle/core` at top of `.tsx` test file                  |
| Render throws on an event handler  | The value is a function; handlers are strings (vincle renders on the server)       |
| Inline script arrives HTML-escaped | It doesn't: `<script>` children are rawtext; check nothing wrapped them in `raw()` |
