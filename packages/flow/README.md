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

[Streaming](https://vincle.cjean.fr/integration/streaming) ·
[Static generation](https://vincle.cjean.fr/integration/static) ·
[Adapters](https://vincle.cjean.fr/integration/adapters) ·
[API](https://vincle.cjean.fr/api/flow/renderToStream)

MIT © Christophe Jean
