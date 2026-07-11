# @vincle/flow

Fragment streaming extension for [@vincle/core](https://github.com/vincle/vincle/tree/main/packages/core). Renders deferred JSX fragments and delivers them to the browser as DOM patches. **Pick the adapter that matches your JS budget — from zero JS (WebPlatform/ESI) to ~550 B (Native) to full framework (Turbo/HTMX).**

## When to use

Use `@vincle/core` alone for SSG, emails, and pure SSR. Add `@vincle/flow` when you need **progressive enhancement**: the initial HTML loads fast with placeholders, and heavy or slow components are rendered separately and patched into the page without a full reload.

| `@vincle/core`            | `@vincle/flow`                                     |
| ------------------------- | -------------------------------------------------- |
| Renders JSX → HTML string | Adds deferred fragments + streaming patch delivery |
| Server-only, zero runtime | Emits adapter-specific markup for DOM updates      |
| `renderToString()`        | `renderStream()` / `renderToStatic()`              |
| —                         | Adapters: Turbo, HTMX, Native, WebPlatform, ESI    |

## Why deferred regions in streaming SSR

A standard `renderToString` call is a serial pipeline: the server computes the full page before sending the first byte. With streaming, the shell (layout, navigation, above-the-fold content) goes to the browser immediately while heavy components are still rendering.

Each deferred region renders **concurrently** and independently — the slowest component does not block the others. The browser receives the shell, paints it, then receives patches as they arrive and applies them in-place.

- **TTFB / FCP** — users see content in one round-trip, not after all async work settles
- **No virtual DOM, no hydration** — patches are applied as plain HTML by the adapter's client mechanism (Turbo, HTMX) or a minimal polyfill
- **Fault isolation** — a failed fragment routes to `onError` (or logs) and is skipped; the rest of the page is unaffected
- **Memory** — fragments are streamed out as they render, not accumulated before flushing

## Why deferred regions in SSG

In static generation every page is a snapshot. Cache invalidation is the hard part: when a deeply nested component changes, you regenerate the entire page. Deferred fragments split that snapshot.

The shell (stable layout, navigation) is one file. Each fragment is a separate file at a predictable URL. Your build pipeline treats them independently:

- **Granular invalidation** — only fragments whose data changed need to be regenerated; the shell stays cached
- **Per-fragment TTL** — a "live prices" fragment can expire in 60 s while the surrounding page is cached for a day
- **CDN composition** — shell and fragments are plain HTML files; any CDN can serve them
- **Incremental builds** — on large sites, regenerating ten fragment files instead of ten thousand pages cuts build time

## Install

```bash
bun add @vincle/flow
```

## Components

@vincle/flow provides four declarative primitives for deferred content. Each works with any adapter, in both streaming and static generation.

### `<Slot>` — a named insertion point with fallback content

Declares a named insertion point in the shell. Its `children` are rendered immediately as placeholder content — visible in the initial HTML until a `<Fill target="…">` overrides them. An empty slot tells the adapter to render an empty placeholder.

```tsx
import { Slot, Fill } from "@vincle/flow";

function Layout() {
  return (
    <html>
      <body>
        <nav>...</nav>
        <main>
          <Slot name="page">
            <p>Loading…</p>
          </Slot>
        </main>
      </body>
    </html>
  );
}

// Elsewhere in the tree (or a different component):
function PageContent() {
  return <Fill target="page">{() => <h1>Hello</h1>}</Fill>;
}
```

`Slot` registers nothing in the pending store — it is purely a passive hole. The `children` are the initial fallback, visible until a `<Fill>` pushes deferred content that patches the placeholder.

### `<Fill>` — push content into a slot

Pushes deferred content into an existing slot by name. Renders nothing itself (returns `null`).

`children` is deferred automatically by the descriptor system — you can pass plain JSX:

```tsx
import { Fill } from "@vincle/flow";

// Plain JSX — deferred automatically (no thunk needed)
<Fill target="page"><h1>Hello</h1></Fill>
<Fill target="comments"><Comments /></Fill>
```

For **cancellation** (`AbortSignal` tied to request lifetime and per-fragment timeout), pass a factory:

```tsx
// One-shot: factory returns a node
<Fill target="page">{() => <h1>Hello</h1>}</Fill>

// Async: factory returns a Promise
<Fill target="comments">{() => <Comments />}</Fill>

// Stream: factory returns an AsyncIterable — each yield is a separate patch
<Fill target="feed" merge="append">
  {() => liveRows()}
</Fill>

// Cancellable factory with timeout — receives AbortSignal
<Fill target="dashboard" timeout={2000}>
  {(signal) => <Dashboard signal={signal} />}
</Fill>
```

### `<Defer>` — deferred content (streaming or SSG)

Declares a deferred region with a placeholder in the shell. The `fallback` prop defines placeholder content shown immediately. `children` is deferred automatically — no thunk required:

```tsx
import { Defer, Fill } from "@vincle/flow";

// Plain JSX — deferred automatically
<Defer name="comments" fallback={<p>Loading…</p>}>
  <Comments />
</Defer>

// Same pattern with Slot for the placeholder + Fill for the content:
<Slot name="comments"><p>Loading…</p></Slot>
<Fill target="comments"><Comments /></Fill>
```

Pass a factory when you need the `AbortSignal` for cancellation:

```tsx
// Cancellable — receives AbortSignal (request lifetime + timeout)
<Defer name="dashboard" fallback={<p>Loading…</p>}>
  {(signal) => <HeavyDashboard signal={signal} />}
</Defer>
```

### `<ClientFetch>` — client-side fetch only

Renders a placeholder with a `src` attribute — the browser fetches the fragment after the shell lands. No server-push, works with any static host. Renders no deferred work on the server.

```tsx
import { ClientFetch } from "@vincle/flow";

<ClientFetch src="/fragments/comments.html" />;

// @ts-expect-error — dangerous schemes are rejected at compile time
<ClientFetch src="javascript:alert(1)" />;
```

`src` uses a strict **whitelist**: for string **literals**, only `http(s):` and relative paths compile. Every other scheme (`javascript:`, `data:`, `mailto:`, …) is a compile-time error — exactly what a fragment fetch needs. Dynamic `string` values pass through and remain the caller's responsibility.

### Content forms

`Defer` and `Fill` accept deferred content in either form:

| Child                        | Behaviour                                                             |
| ---------------------------- | --------------------------------------------------------------------- |
| JSX node (plain children)    | Deferred automatically — executes when the fragment renders           |
| `(signal: AbortSignal) => …` | **Cancellable** — receives `AbortSignal` (request cancel + `timeout`) |

The factory is invoked lazily and receives an `AbortSignal` for cancellation. It must return a renderable JSX node (or a `Promise` / `AsyncIterable` thereof — the runtime unwraps these automatically).

`Slot` children are plain JSX (not deferred) — they render immediately as the fallback placeholder in the shell.

### Common props

| Prop       | Applies to      | Meaning                                                             |
| ---------- | --------------- | ------------------------------------------------------------------- |
| `name`     | `Slot`          | id of the placeholder (required)                                    |
| `name`     | `Defer`         | id of the placeholder (auto-generated if omitted)                   |
| `target`   | `Fill`          | target slot id to push content into                                 |
| `fallback` | `Defer`         | placeholder content shown in the shell while deferred content loads |
| `merge`    | `Defer`, `Fill` | how content applies to its target (default `"replace"`) — see below |
| `timeout`  | `Defer`, `Fill` | per-fragment render timeout in ms                                   |
| `onError`  | `Defer`, `Fill` | per-fragment error handler, overriding the renderer's `onError`     |
| `src`      | `ClientFetch`   | URL the browser fetches for the fragment content                    |

### Merge types

`merge` describes how content is applied **relative to the target DOM element identified by `id`**.

| `merge`     | Effect                                          |
| ----------- | ----------------------------------------------- |
| `"replace"` | Target element is replaced by content (default) |
| `"append"`  | Content inserted as last child of target        |
| `"prepend"` | Content inserted as first child of target       |
| `"before"`  | Content inserted as previous sibling of target  |
| `"after"`   | Content inserted as next sibling of target      |

An adapter that cannot express a merge **rejects it at registration** with a clear error (see capabilities). `WebPlatformAdapter` and `EsiAdapter` support `"replace"` only.

## Adapters

Each adapter implements `Placeholder`/`Patch`/`Frame` (JSX), `encode()` (streaming wire format, delegated to `Patch`), optional `transformShell`, and a `capabilities` descriptor. Adapters are **pure wire formats** — HTTP negotiation is a separate concern (see below).

| Adapter              | `Placeholder`          | `Patch` (streaming inline)                      | `Frame` (SSG lazy-load) |
| -------------------- | ---------------------- | ----------------------------------------------- | ----------------------- |
| `TurboAdapter`       | `<turbo-frame>`        | `<turbo-stream action="…">`                     | `<turbo-frame id="…">`  |
| `HtmxAdapter`        | `<div hx-get>`         | `<div hx-swap-oob="…">`                         | `<div id="…">`          |
| `NativeAdapter`      | `<?start name>…<?end>` | `<template for>` (`data-merge` for non-replace) | `<template for="…">`    |
| `WebPlatformAdapter` | `<?start name>…<?end>` | `<template for="…">` (`replace` only)           | `<template for="…">`    |
| `EsiAdapter`         | `<esi:include src>`    | `<esi:inline name fetchable>` (static only)     | raw HTML                |

- **`Patch`** — fragment delivered inline in the same HTTP response as the shell.
- **`Frame`** — fragment served as a standalone file fetched by the client (SSG).
- `NativeAdapter` is the **default** — it injects a ~550 B polyfill for DOM patching. Pass `WebPlatformAdapter` for zero-JS output, or `EsiAdapter` for CDN-level composition without client JS. No adapter = no JS at all.

### Capabilities

Every adapter declares what its wire format can express:

```ts
type AdapterCapabilities = {
  streaming: boolean; // can carry a live FlowEvent stream
  merges: readonly MergeType[]; // which merges it supports
};
```

This is surfaced in the type system. `renderStream` / `serve` require a streaming adapter, so **`EsiAdapter` is rejected at compile time** there — ESI composition happens at the CDN, via `renderToStatic` + `emitFragments`. An unsupported `merge` fails fast at registration.

#### `NativeAdapter` (default — ~550 B polyfill)

Uses the [Declarative Partial Updates](https://developer.chrome.com/blog/declarative-partial-updates) API plus a minimal polyfill injected via `transformShell`. All merge types, no external client library, works in modern browsers.

Every update is a **declarative `<template for>`** — the merge mode rides on `data-merge`, lazy client fetches on `data-src`. There are **no per-fragment inline scripts**; the only JS is a single static polyfill, which makes a strict CSP straightforward:

```ts
import {
  NativeAdapter,
  nativePolyfillHash,
  NATIVE_POLYFILL,
} from "@vincle/flow/adapters";

// Option A — keep the inline <script>, pin it by hash (static ⇒ cache/SSG-safe):
res.headers.set(
  "Content-Security-Policy",
  `script-src 'self' '${await nativePolyfillHash()}'`,
);

// Option B — serve the polyfill from your origin under script-src 'self':
//   write NATIVE_POLYFILL to e.g. /flow.js, then:
const selfHosted = {
  ...NativeAdapter,
  transformShell: (shell: string) =>
    injectIntoHead(shell, `<script src="/flow.js"></script>`),
};
```

A per-request **nonce** is intentionally not offered: it would break the static-cache/SSG story. A hash works because the script never changes.

#### `WebPlatformAdapter`

Pure WICG spec — no JS at all. Requires `chrome://flags/#enable-experimental-web-platform-features` until the spec ships. `"replace"` only.

#### `EsiAdapter` — CDN-level composition

For **SSG with a CDN ESI processor** (Varnish, Fastly, nginx ESI module). The shell contains `<esi:include src="…">` tags; the CDN fetches each fragment independently, applies separate TTLs, and assembles the final response before it reaches the browser. `"replace"` only; no client-side JS.

```tsx
// Defer with ESI — placeholder becomes esi:include, content renders the fragment
<Defer name="nav" fallback={<span>Loading nav…</span>}>
  {(signal) => <Nav signal={signal} />}
</Defer>
<Defer name="feed" fallback={<span>Loading feed…</span>}>
  {(signal) => <Feed signal={signal} />}
</Defer>
// Plain JSX also works when no signal is needed:
<Defer name="footer" fallback={<span>Loading…</span>}>
  <Footer />
</Defer>
```

## Usage

### Streaming (server pushes fragments)

```tsx
import { renderStream, Defer } from "@vincle/flow";

const stream = renderStream(() => (
  <html>
    <body>
      <header>Fast</header>
      <Defer name="dashboard">
        <HeavyDashboard />
      </Defer>
    </body>
  </html>
));
// → ReadableStream<string> (NativeAdapter by default). Pipe it to the HTTP response.
// Pass a second arg (TurboAdapter, HtmxAdapter, …) to switch wire format.
```

### Static generation, pure-static (no deferred content)

```tsx
import { renderToStatic } from "@vincle/flow";

await renderToStatic(async (ctx) => {
  for (const page of pages) {
    const html = await ctx.renderPage(() =>
      page.component({ currentPage: page.url }),
    );
    await Bun.write(page.outPath, "<!DOCTYPE html>\n" + html);
  }
});
```

No adapter required — @vincle/flow stays invisible for pure-static rendering.

### Static generation with deferred fragments

```tsx
import { renderToStatic } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

await renderToStatic(
  async (ctx) => {
    for (const page of pages) {
      const html = await ctx.renderPage(() =>
        page.component({ currentPage: page.url }),
      );
      await Bun.write(page.outPath, "<!DOCTYPE html>\n" + html);
    }

    // Each fragment is already wrapped in adapter.Frame and rendered —
    // `html` is ready to write, no raw()/renderToString needed.
    await ctx.emitFragments((id, url, html) => Bun.write("./out" + url, html));
  },
  {
    adapter: NativeAdapter,
    generatePath: (id) => `/fragments/${id}.html`,
  },
);
```

### HTTP responses with negotiation

Negotiation is **opt-in and decoupled from the adapter**: pass a `negotiate` function (e.g. `negotiateHtmx`, or your own) to extract per-request hints and headers. Without it, the full page is rendered and the client library extracts its own target.

```tsx
import { serve, negotiateHtmx } from "@vincle/flow/http";
import { WebPlatformAdapter } from "@vincle/flow/adapters";

Bun.serve({
  fetch(req) {
    return serve(req, (n) => <App target={n.target} />, WebPlatformAdapter, {
      negotiate: negotiateHtmx,
      // `mode: "fragment"` (shell suppressed) is an explicit opt-in and only
      // produces output when the targeted content is expressed as deferred fragments.
    });
  },
});
```

### Composing shell transforms

`composeShell` chains several `transformShell` functions (e.g. to inject `<title>`, asset links) into one — falsy entries are skipped, so an adapter's own transform splices in cleanly:

```tsx
import { NativeAdapter, createAdapter } from "@vincle/flow/adapters";
import { composeShell, injectIntoHead } from "@vincle/flow/utils";

const metadata = () => (html: string) =>
  injectIntoHead(html, "<title>Home</title>");

const MyAdapter = createAdapter({
  ...NativeAdapter,
  transformShell: composeShell(NativeAdapter.transformShell, metadata()),
});
```

## API

All exports are importable from `@vincle/flow` unless noted otherwise.

### Components

| Export        | Import path               | Description                                                                  |
| ------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `Slot`        | `@vincle/flow`            | Named insertion point with optional fallback children; renders a placeholder |
| `Fill`        | `@vincle/flow`            | Push content into a slot by target id; renders nothing                       |
| `Defer`       | `@vincle/flow`            | Deferred content with a placeholder; fills when resolved                     |
| `ClientFetch` | `@vincle/flow`            | Client-side fetch placeholder — no server deferral                           |
| `Style`       | `@vincle/flow/components` | Named, deduplicated `<style>` tag                                            |
| `Script`      | `@vincle/flow/components` | Named, deduplicated `<script>` tag                                           |

### Renderers

| Export               | Import path         | Description                                                                                   |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `renderStream`       | `@vincle/flow`      | Streams shell + fragments as a `ReadableStream<string>` via the given `adapter`               |
| `renderToFlowEvents` | `@vincle/flow`      | Lower level: `ReadableStream<FlowEvent>` (semantic events) with backpressure and cancellation |
| `renderToStatic`     | `@vincle/flow`      | Runs `handler` in a static render scope                                                       |
| `serve`              | `@vincle/flow/http` | Full HTTP `Response` builder                                                                  |

### Negotiation

| Export          | Import path         | Description                                      |
| --------------- | ------------------- | ------------------------------------------------ |
| `negotiateHtmx` | `@vincle/flow/http` | HTMX negotiation: reads `HX-Target`, sets `Vary` |
| `Negotiate`     | `@vincle/flow/http` | Type: `(req: Request) => Negotiation`            |

### Adapters

| Export               | Import path             | Description                                                        |
| -------------------- | ----------------------- | ------------------------------------------------------------------ |
| `NativeAdapter`      | `@vincle/flow/adapters` | Declarative Partial Updates + polyfill — all merge types (default) |
| `TurboAdapter`       | `@vincle/flow/adapters` | Hotwire Turbo Streams — all merge types                            |
| `HtmxAdapter`        | `@vincle/flow/adapters` | HTMX OOB swaps — all merge types                                   |
| `WebPlatformAdapter` | `@vincle/flow/adapters` | Pure WICG spec, zero JS — `replace` only                           |
| `EsiAdapter`         | `@vincle/flow/adapters` | CDN-level ESI composition — `replace` only, static only            |
| `createAdapter`      | `@vincle/flow/adapters` | Build a custom adapter                                             |
| `NATIVE_POLYFILL`    | `@vincle/flow/adapters` | Native adapter polyfill as a JS string                             |
| `nativePolyfillHash` | `@vincle/flow/adapters` | `() => Promise<string>` — CSP hash for the polyfill                |

### Types

| Export                | Import path             | Description                                                            |
| --------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `Adapter`             | `@vincle/flow/adapters` | `{ Placeholder, Patch, Frame, capabilities, encode, transformShell? }` |
| `StreamingAdapter`    | `@vincle/flow/adapters` | `Adapter` with `capabilities.streaming: true`                          |
| `AdapterCapabilities` | `@vincle/flow/adapters` | `{ streaming: boolean; merges: readonly MergeType[] }`                 |
| `FlowContext`         | `@vincle/flow`          | Flow render context                                                    |
| `PureStaticContext`   | `@vincle/flow`          | Static generation context (no `emitFragments`)                         |
| `StaticContext`       | `@vincle/flow`          | Static generation context with `emitFragments`                         |
| `MergeType`           | `@vincle/flow/types`    | `"replace" \| "append" \| "prepend" \| "before" \| "after"`            |
| `FlowEvent`           | `@vincle/flow/types`    | `{ type: "shell" \| "fragment" \| "close", … }`                        |
| `Negotiation`         | `@vincle/flow/types`    | `{ headers?, mode?, target? }`                                         |
| `DeferContent`        | `@vincle/flow/types`    | `VNode \| ((signal: AbortSignal) => VNode)`                  |

### Utilities

| Export             | Import path           | Description                                                          |
| ------------------ | --------------------- | -------------------------------------------------------------------- |
| `composeShell`     | `@vincle/flow/utils`  | Compose several `transformShell` (string→string) into one            |
| `injectIntoHead`   | `@vincle/flow/utils`  | Insert markup before `</head>` (building block for shell transforms) |
| `resolveAssets`    | `@vincle/flow/assets` | Resolve asset markers (`<Style>`/`<Script>`) in HTML                 |
| `createAssetState` | `@vincle/flow/assets` | Create a fresh asset dedup state                                     |

## License

MIT © Christophe Jean
