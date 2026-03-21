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
      "@vincle/core/no-unsafe-event-handlers": "warn",
    },
  },
];
```

## Rules

| Rule                       | Description                                                | Default |
| -------------------------- | ---------------------------------------------------------- | ------- |
| `no-react-imports`         | Disallow React and React-DOM imports.                      | `error` |
| `no-react-hooks`           | Disallow React hooks usage (useState, useEffect, etc).     | `error` |
| `no-unsafe-event-handlers` | Warn about event handlers which might be unsafely handled. | `warn`  |
| `no-javascript-urls`       | Disallow `javascript:` URLs in href attributes.            | `error` |
| `no-context`               | Disallow React Context usage.                              | `error` |
| `no-refs`                  | Disallow React refs usage.                                 | `error` |

## License

MIT © Christophe Jean

---

<p align="center">Made with ❤️ in Paris</p>
