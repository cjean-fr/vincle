# @vincle/eslint-plugin

ESLint plugin for `@vincle/core` to ensure compatibility with static rendering.

## Installation

```bash
bun add -D @vincle/eslint-plugin
# or
npm install --save-dev @vincle/eslint-plugin
```

## Usage (Flat Config)

Add the plugin to your `eslint.config.js`:

```javascript
import jsxString from "@vincle/eslint-plugin";

export default [
  jsxString.configs.recommended,
  {
    rules: {
      // You can override rules if needed
      "@vincle/no-unsafe-event-handlers": "warn",
    },
  },
];
```

## Recommended configuration

`jsxString.configs.recommended` enables all rules with sensible defaults.
Every rule catches a class of bug specific to server-side JSX:

- **React patterns** that don't exist in Vincle (`useState`, `useEffect`, refs)
- **Security risks** (`javascript:` URLs, function-valued attributes)
- **Type system hygiene** (global `JSX` namespace pollution)

## Rules

| Rule | Description | Default | Rationale |
| -------------------- | ----------- | --------- |
| `no-react-imports` | Disallow React and React-DOM imports. | `error` | Imports are dead code; suggest `@vincle/core` instead. |
| `no-react-hooks` | Disallow React hooks usage (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`). | `error` | These hooks don't exist at runtime; using them is always a bug. |
| `no-unsafe-event-handlers` | Warn about inline handler strings and function-valued HTML attributes. | `warn` | `onClick={() => ...}` creates a function-valued attribute that throws at render. Use HTML attributes (`hx-*`, `x-on:click`) or `<form>`. |
| `no-javascript-urls` | Disallow `javascript:` URLs in `href` attributes. | `error` | Vincle blocks `javascript:` at runtime, but catching it at lint time is safer. |
| `no-context` | Disallow React Context usage (`React.createContext`, `React.Context`). | `error` | Vincle has its own `createContext` — mixing them is always wrong. |
| `no-refs` | Disallow React refs usage (`ref` attribute, `useRef`). | `error` | No DOM node to hold; a `ref` is always dead code in server JSX. |
| `no-global-jsx-namespace` | Disallow the global `JSX` namespace; import `JSX` from `@vincle/core` (or use `VNode`) instead. | `error` | The global `JSX` comes from a different runtime and has incompatible types. |

### `no-unsafe-event-handlers` examples

```tsx
// ✅ OK — HTML attribute string evaluated by the browser
<button hx-post="/api/comment" hx-target="#comments">Post</button>

// ✅ OK — standard HTML form
<form action="/api/submit" method="POST">
  <button type="submit">Submit</button>
</form>

// ⚠️ Warned — function-valued attribute (throws at render)
<button onClick={() => submit()}>Submit</button>

// ⚠️ Warned — inline handler string (rarely useful, breaks CSP)
<button onclick="submit()">Submit</button>
```

### `no-react-hooks` examples

```tsx
// ✅ OK — plain function component
function Profile({ id }: { id: string }) {
  return <div>Profile {id}</div>;
}

// ❌ Error — useState doesn't exist
function Counter() {
  const [count, setCount] = useState(0); // no-react-hooks
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}

// ❌ Error — useEffect doesn't exist
function Scroll() {
  useEffect(() => {
    /* ... */
  }, []); // no-react-hooks
  return <div>Scroll</div>;
}
```

## Rules that live elsewhere

`@vincle/core` refuses content inside a void element (`<img>{caption}</img>`) at
render time. To be told while writing, enable `void-dom-elements-no-children`
from `eslint-plugin-react`, or its port of the same name in oxlint. It reads a
tag and its children and nothing else, so despite the package it sits in, it is
a rule about JSX rather than about React. It is not repeated here.

## Configuration

Each rule accepts no options. They are always `error` or `warn` as noted in the
table. To suppress a specific warning, use an inline eslint comment:

```tsx
// eslint-disable-next-line @vincle/no-unsafe-event-handlers
<button onclick="alert('hi')">Click</button>
```

## License

MIT © Christophe Jean

---

<p align="center">Made with ❤️ in Paris</p>
