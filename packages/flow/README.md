# @vincle/flow

Deferred fragments and streaming for `@vincle/core`. Send the page shell first,
then patch in content as it becomes ready. Also supports static generation
with separate fragment files.

## Install

```sh
bun add @vincle/core @vincle/flow
pnpm add @vincle/core @vincle/flow
npm install @vincle/core @vincle/flow
```

Configure JSX with `jsx: "react-jsx"` and `jsxImportSource: "@vincle/core"`.

## Usage

```tsx
import { Defer, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

async function Content() {
  return <p>Deferred content</p>;
}

const stream = renderToStream(
  () => (
    <html>
      <body>
        <h1>Ready immediately</h1>
        <Defer target="content" fallback={<p>Loading…</p>}>
          <Content />
        </Defer>
      </body>
    </html>
  ),
  NativeAdapter,
);

const response = new Response(stream.pipeThrough(new TextEncoderStream()), {
  headers: { "content-type": "text/html; charset=utf-8" },
});
```

`Defer` emits a placeholder and schedules its content. `Slot` declares a named
insertion point. Use `serve` from `@vincle/flow/http` for HTTP responses, or
`renderToStatic` for static generation.

Adapters are exported from `@vincle/flow/adapters`: Native (automatic polyfill),
Turbo, HTMX, WebPlatform (requires browser support) and ESI (static only).

[Streaming](https://vincle.cjean.fr/integration/flow/streaming) ·
[Static generation](https://vincle.cjean.fr/integration/flow/static) ·
[Adapters](https://vincle.cjean.fr/integration/flow/adapters) ·
[API](https://vincle.cjean.fr/api/flow/renderToStream)

MIT © Christophe Jean

### Concurrency and diagnostics

Streaming options and `renderToStatic` options accept `maxConcurrency` and
`onObserve`:

```ts
const options = {
  maxConcurrency: 8,
  defaultTimeout: 5000,
  onObserve(event) {
    console.log(event.id, event.phase, event.durationMs);
  },
};
```

The limit counts active fragments, including live streams, until their output
has been emitted. It defaults to unlimited concurrency. Use lazy factories to
limit data fetching: a promise created before rendering has already started.
Long-lived streams occupy a slot; set a timeout or reserve sufficient slots
for the other fragments. Nested fragments retain generation ordering.

Observations have phases `start`, `complete`, `error`, `timeout`, or `cancel`,
a fragment ID, elapsed milliseconds, and an optional error. A recovered error
remains an error observation. Observer exceptions are ignored. `onError` still
controls fallback rendering; diagnostics do not replace it.
