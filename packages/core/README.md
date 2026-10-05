# @vincle/core

Render JSX to HTML strings on the server. Async components, typed HTML/SVG
attributes, escaping and URL filtering built in. Zero runtime dependencies.

## Install

```sh
bun add @vincle/core
pnpm add @vincle/core
npm install @vincle/core
```

Set the JSX runtime in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vincle/core"
  }
}
```

## Usage

```tsx
import { renderToString } from "@vincle/core";

function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

const html = await renderToString(<Greeting name="world" />);
// "<h1>Hello, world!</h1>"
```

Components can return promises or iterables. Text and attributes are escaped
by default; use `raw()` only for trusted HTML. `createContext` / `useContext`
provide tree-scoped values, and `Scope` holds per-render state.

For deferred fragments and streaming, add `@vincle/flow`.

[Getting started](https://vincle.cjean.fr/guide/getting-started/first-render) ·
[API](https://vincle.cjean.fr/api/core/renderToString) ·
[Security](https://vincle.cjean.fr/guide/security)

MIT © Christophe Jean
