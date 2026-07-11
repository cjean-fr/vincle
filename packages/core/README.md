# @vincle/core

[![CI](https://github.com/vincle/vincle/actions/workflows/ci.yml/badge.svg)](https://github.com/vincle/vincle/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@vincle/core)](https://www.npmjs.com/package/@vincle/core)
[![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/vincle/vincle/main/packages/core/badges/coverage.json&logo=vitest)](https://github.com/vincle/vincle/actions/workflows/ci.yml)
[![gzip size](https://img.badgesize.io/https://unpkg.com/@vincle/core/dist/index.js?compression=gzip&label=gzip)](https://unpkg.com/@vincle/core/dist/index.js)

**Render JSX to HTML — zero browser runtime.**

---

## Who is this for?

| You're building…                                     | And you're tired of…                             | @vincle/core gives you…                     |
| ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| **Email templates**                                  | String concatenation, EJS, or shipping React DOM | Typed JSX, ~3 KB, zero browser runtime      |
| **API responses** that return HTML                   | Handlebars or ad-hoc template engines            | Type-safe components, async data fetching   |
| **Static site generation**                           | Hydration tax or framework lock-in               | One-pass rendering, no virtual DOM overhead |
| **SSR in non-React apps** (Hono, Fastify, Bun.serve) | No type-safe HTML generation on the server       | Familiar JSX syntax, server-first context   |

## Why not just use react-dom/server?

| Aspect                | @vincle/core                           | react-dom/server              | preact-render-to-string                                       |
| --------------------- | -------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| **Bundle impact**     | **~3 KB**, zero deps                   | ~140 KB (React + scheduler)   | ~8 KB (depends on Preact core)                                |
| **Async**             | Native `await` in render               | Via Suspense only             | Sync only                                                     |
| **Context isolation** | Scoped per-request (AsyncLocalStorage) | Provider-based, shared        | Provider-based, shared                                        |
| **Security**          | Escape + URL blocking + handler drop   | Escape only                   | Escape only                                                   |
| **DOM dependency**    | None — runs in any JS runtime          | Requires DOM shim or polyfill | Requires Preact shim                                          |
| **What it does**      | JSX → HTML string, nothing else        | Full client/server reconciler | Preact renderer ⏤ same job, no reconciler but no async either |

No hooks. No refs. No hydration. No reconciler. No browser runtime. Your component runs once, produces a string, and stops. Add the browser only when you choose to, with `@vincle/flow`.

---

## Install

```bash
bun add @vincle/core   # or: npm install
```

### Configuration

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vincle/core"
  }
}
```

For Vite/esbuild: use `jsx: "automatic"` with the same `jsxImportSource`.
`@types/react` is optional — install it for attribute autocomplete.

---

## Quickstart

### Basic rendering

```tsx
import { renderToString } from "@vincle/core";

const html = await renderToString(
  <main>
    <h1>Hello, world!</h1>
    <p>@vincle/core renders JSX to plain HTML strings.</p>
  </main>,
);
// => "<main><h1>Hello, world!</h1><p>@vincle/core renders JSX to plain HTML strings.</p></main>"
```

### Async components (the simple way)

```tsx
import { renderToString } from "@vincle/core";

const Greeting = async ({ id }: { id: string }) => {
  const user = await db.users.find(id); // await works directly in render
  return <h1>Hello {user.name}</h1>;
};

const html = await renderToString(<Greeting id="42" />);
// => "<h1>Hello Alice</h1>"
```

`renderToString` **always returns `Promise<string>`** — even for sync trees.
Concurrent renders work out of the box: `await Promise.all([renderToString(a), renderToString(b)])`.

---

## Core Features

### 🔒 Security by Default

@vincle/core **escapes everything by default** — no opt-in required:

```tsx
// Text content: & < > escaped
<div>{'<script>alert(1)</script>'}</div>
// => <div>&lt;script&gt;alert(1)&lt;/script&gt;</div>

// URL attributes: javascript:/vbscript:/data: blocked
<a href="javascript:alert(1)">x</a>
// => <a href="#blocked">x</a>

// Event handlers: only strings accepted (functions dropped + warn)
<button onClick={() => {}}>x</button>
// => <button>x</button> (onClick dropped)

// Invalid tag names throw a TypeError (a name that could break out of the
// markup — only reachable via a manual jsx() call, never from authored JSX)
jsx("bad tag", {});
// => throws TypeError
```

**Your responsibility:**

- `raw(html)` and `dangerouslySetInnerHTML` **bypass escaping** — never use with untrusted input.
- Event handler strings (`onClick="myFunc()"`) are HTML-escaped, but the JS inside is **not sanitized** — never interpolate user data.

```tsx
import { raw } from "@vincle/core";

// ✅ Safe: trusted source (e.g., markdown renderer)
<div>{raw('<b>trusted HTML</b>')}</div>

// ❌ UNSAFE: user input
<div>{raw(userInput)}</div>  // XSS risk!
```

### 🔄 Context API (Scoped Context)

Per-request context with **typed keys** — `AsyncLocalStorage`-backed, no provider components needed, designed for server-side isolation.

```tsx
import {
  context,
  useContext,
  setContext,
  withScope,
  renderToString,
} from "@vincle/core";

// Define context keys at module level — same key always resolves to the same
// Symbol within a given @vincle/core instance.
const Auth = context<{ userId: string }>("my-app:auth");

const Page = () => <p>User: {useContext(Auth).userId}</p>;

// Each request gets isolated context — no cross-request leaks
const html = await withScope(async () => {
  setContext(Auth, { userId: "42" });
  return renderToString(<Page />);
});
// => <p>User: 42</p>
```

**Nested scopes with inheritance:**

```tsx
await withScope(async () => {
  setContext(Auth, { userId: "42" });

  // Child scope inherits parent data via snapshot()
  await withScope(async () => {
    const parentData = snapshot(); // captures current context
    // ... use parentData to seed child scope
  });
});
```

`useContext` **throws if called outside a scope** or before `setContext` is called.

### 📦 Trusted HTML

Use `raw()` for HTML from trusted sources (markdown renderers, sanitizers):

```tsx
import { raw } from "@vincle/core";

const markdownHtml = await renderMarkdown("# Hello");
<div>{raw(markdownHtml)}</div>;
// => <div><h1>Hello</h1></div> (no escaping)
```

`dangerouslySetInnerHTML` also works (React-compatible API):

```tsx
<div dangerouslySetInnerHTML={{ __html: "<b>trusted</b>" }} />
```

### 🛡️ Error Boundaries

Catch rendering errors from child components and display a fallback instead. Works at any depth — nested boundaries are supported.

```tsx
import { ErrorBoundary } from "@vincle/core";

const Profile = async ({ id }: { id: string }) => {
  const user = await db.users.find(id);
  return <h1>{user.name}</h1>;
};

const Page = ({ id }: { id: string }) => (
  <html>
    <body>
      <ErrorBoundary
        fallback={(error) => <p>Failed: {(error as Error).message}</p>}
      >
        <Profile id={id} />
      </ErrorBoundary>
    </body>
  </html>
);

const html = await renderToString(<Page id="42" />);
// On success:  <html><body><h1>Alice</h1></body></html>
// On error:    <html><body><p>Failed: not found</p></body></html>
```

**How it works:**

Every JSX expression produces a lazy **descriptor** — a plain object `{ type, props, key }` — instead of eagerly rendering. `renderToString` walks descriptors at render time, where `ErrorBoundary` wraps its children in a try/catch:

- `fallback` receives the caught error: `(error: unknown) => VNode`
- Errors propagate up to the nearest boundary (React-style)
- Uncaught errors are annotated with the component name in the error message: `[Profile] not found`
- Errors not caught by any boundary reject the `renderToString` promise

`ErrorBoundary` is identified by an internal symbol — it produces no wrapper HTML, not even a comment.

---

## API Reference

| Export                     | Type                       | Description                                                                                               |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `renderToString(node)`     | `Promise<string>`          | Renders JSX tree to HTML string.                                                                          |
| `raw(string)`              | `RawString`                | Marks HTML as trusted (no escape).                                                                        |
| `Fragment`                 | `symbol`                   | Standard JSX Fragment (`<>…</>`).                                                                         |
| `ErrorBoundary`            | `Component`                | Catches child rendering errors, renders `fallback(error)` instead.                                        |
| `context<T>(key)`          | `ContextKey<T>`            | Creates a typed, namespaced context token. `key` is a globally-unique string (e.g. `"@org/pkg:purpose"`). |
| `setContext(token, value)` | `void`                     | Writes to current scope.                                                                                  |
| `useContext(token)`        | `T`                        | Reads from current scope; **throws if absent**.                                                           |
| `withScope(fn, options?)`  | `Promise<T>`               | Runs `fn` in isolated async scope.                                                                        |
| `snapshot()`               | `Map<ContextKey, unknown>` | Captures current scope state for sub-scopes.                                                              |

---

## Security Model (Deep Dive)

The security layer is reinforced with **property-based (fuzz) tests** using `fast-check` — every commit generates thousands of adversarial inputs (control chars, astral codepoints, scheme obfuscations, Unicode injections) to verify invariants like "no angle bracket escapes" and "lossless reversible encoding" hold for every possible input, not just hand-picked payloads.

### ✅ Defended by Default

All outputs are sanitized **automatically** — no configuration needed.

#### Text Content

- Escapes: `&` ` <` `>`
- Example: `<script>` → `&lt;script&gt;`

#### Attributes

- **Names:** Rejects whitespace, quotes, `<`, `>`, `/`, `=`, and Unicode "Other" chars (controls, ZWSP, LRM, surrogates).
  Regex: `/^[^\s"'<>/=\p{C}]+$/u`
- **Values:** Escapes `&` ` <` `>` `"`; always double-quoted.
- **URL attributes:** Blocks `javascript:`, `vbscript:`, non-image `data:` schemes.
  Blocked schemes replaced with `#blocked`.
  Obfuscation via `\0`, `\t`, `\n` stripped before check.
  Affected attributes: `href`, `src`, `action`, `formaction`, `cite`, `poster`, `icon`, `data`, `xlink:href`, `srcset`.

#### Tags

- Rejected only if the name could break out of `<...>`: empty, a leading `!`/`?`, or containing whitespace, a control character, or any of `" ' < > / = \` \`. Namespaced (`svg:rect`), underscore, and custom-element names are allowed.
- Invalid tag names throw a `TypeError` (fail fast). Only reachable via a manual `jsx(dynamicString, ...)` call — the JSX transform never emits an unsafe tag.

#### Style

- Rejects `expression()` and `javascript:` in CSS values.
- `url()` arguments validated as URLs (same rules as URL attributes).

#### Event Handlers

- **Strings only:** `onClick="alert(1)"` → allowed (HTML-escaped).
- **Non-strings dropped:** Functions → warn + drop. Numbers/Objects → silent drop.
- ⚠️ **JS not sanitized** — never interpolate user input in handler strings.

### ⚠️ Your Responsibility

| Scenario                  | Risk | Mitigation                    |
| ------------------------- | ---- | ----------------------------- |
| `raw(userInput)`          | XSS  | Sanitize with DOMPurify first |
| `dangerouslySetInnerHTML` | XSS  | Only use with trusted HTML    |
| `onClick={"userFunc()"}`  | XSS  | Never interpolate user data   |

### 🛡️ Trusted HTML

For trusted sources (markdown, templating engines):

```tsx
import { raw } from "@vincle/core";

// ✅ Safe: trusted markdown renderer
const html = await markdownToHtml(userMarkdown);
<div>{raw(html)}</div>;

// ✅ Safe: DOMPurify sanitized
const safeHtml = DOMPurify.sanitize(userInput);
<div>{raw(safeHtml)}</div>;
```

---

## Performance

Benchmarks ported from [preact-render-to-string](https://github.com/preactjs/preact-render-to-string/tree/main/benchmarks).
Source: [`apps/bench/src/bench.ts`](https://github.com/vincle/vincle/tree/main/apps/bench/src/bench.ts).

| Runtime       | Scenario           | @vincle/core | preact-render-to-string@6 | react-dom@18 |
| ------------- | ------------------ | ------------ | ------------------------- | ------------ |
| Node 26 (V8)  | 1000 text blocks   | **635 µs**   | 650 µs                    | 5.1 ms       |
| Node 26 (V8)  | 10×1000 deep stack | **770 µs**   | 820 µs                    | 6.7 ms       |
| Bun 1.3 (JSC) | 1000 text blocks   | **460 µs**   | 670 µs                    | 6.2 ms       |
| Bun 1.3 (JSC) | 10×1000 deep stack | **697 µs**   | 1.15 ms                   | 8.4 ms       |

_Ryzen 7 PRO 8840HS, median of 3 runs._

**Analysis:**

- On Node 26: V8 optimizations make @vincle/core **~parity with Preact** on wide trees, **~7% faster** on deep trees.
- On Bun (JSC): **30-40% faster than Preact** across all scenarios.
- Against React: **8-14× faster** regardless of tree shape (structural advantage — no virtual DOM).

> Numbers vary by machine. Re-run locally from the original monorepo at `https://github.com/vincle/vincle`.
> [CI benchmark artifacts](https://github.com/vincle/vincle/actions/workflows/ci.yml?query=branch%3Amain) — latest results from `main`.

---

## Runtimes

| Runtime                | Support | Notes                                                                         |
| ---------------------- | ------- | ----------------------------------------------------------------------------- |
| **Node 20+**           | ✅ Full | Native `AsyncLocalStorage`                                                    |
| **Bun**                | ✅ Full | Works with `node:async_hooks` (native compatibility)                          |
| **Deno**               | ✅ Full | Works with `node:async_hooks` (native compatibility)                          |
| **Cloudflare Workers** | ✅ Full | Requires `compatibility_flags = ["nodejs_compat_v2"]` for `AsyncLocalStorage` |

### Deno Setup

```json
// tsconfig.json (Deno with jsx: "precompile")
{
  "compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "@vincle/core"
  }
}
```

`jsxTemplate` and `jsxAttr` runtime functions are exported for Deno’s precompile mode.
`dangerouslySetInnerHTML` is **dropped in precompile mode** — use `{raw(html)}` as child instead.

---

## Design Philosophy

### ✅ What @vincle/core Does

- **Lazy descriptors:** JSX produces `{ type, props, key }` — no rendering until `renderToString` walks the tree, which enables `ErrorBoundary` to catch errors at any depth.
- **No virtual DOM:** The descriptor tree is walked once and concatenated — no reconciliation, no diffing.
- **Async-first:** Components can `await` directly in render body.
- **Scoped context:** Typed, nestable context for server-side rendering.
- **Security-first:** Everything escaped by default.

### ⚠️ What @vincle/core Doesn’t Do

- **Client-side rendering:** Server-only. No hydration.
- **React compatibility:** No hooks, no refs, no React runtime.
- **React Server Components:** Not RSC-aware (use Next.js App Router’s built-in renderer).
- **Circular references:** Circular structures in children or props are not supported — rendering them exhausts the call stack, same as `JSON.stringify`.

### 💡 Key Differences from React

| Feature                | @vincle/core             | React               |
| ---------------------- | ------------------------ | ------------------- |
| Async in render        | ✅ Yes                   | ❌ No (needs hooks) |
| Error boundaries       | ✅ Yes (`ErrorBoundary`) | ✅ Yes              |
| Context model          | ✅ Scoped per-request    | ❌ Provider-based   |
| Virtual DOM            | ❌ No                    | ✅ Yes              |
| Hooks                  | ❌ No                    | ✅ Yes              |
| Refs                   | ❌ No                    | ✅ Yes              |
| `class` vs `className` | Separate (no merge)      | Merged              |

---

## When NOT to Use

| Use Case                                     | Recommendation              |
| -------------------------------------------- | --------------------------- |
| Client-side rendering/hydration              | Use React, Preact, or Solid |
| React ecosystem (MUI, Radix, Tanstack Query) | Requires React runtime      |
| Next.js App Router / RSC                     | Use Next.js built-in RSC    |

### For Streaming/DOM Patching

Use [`@vincle/flow`](https://github.com/vincle/vincle/tree/main/packages/flow):

- Adds `<Defer>` (deferred + streaming fragments), `<Slot>`/`<Fill>`, `<ClientFetch>`
- Adapters for Native DOM updates, Turbo Streams, HTMX, ESI, and the Web Platform

---

## License

MIT © Christophe Jean
