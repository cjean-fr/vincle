# @vincle/eslint-plugin

ESLint rules for server-side JSX with Vincle: catch unsupported React patterns,
unsafe attributes and incompatible JSX types.

## Install

```sh
bun add -D @vincle/eslint-plugin
pnpm add -D @vincle/eslint-plugin
npm install -D @vincle/eslint-plugin
```

## Usage

Add the recommended rules to your flat config alongside your JSX/TypeScript
parser configuration:

```js
// eslint.config.js
import vincle from "@vincle/eslint-plugin";

export default [vincle.configs.recommended];
```

## Rules

Rule names use the `@vincle/` prefix. All are enabled as errors by the
recommended config, except `no-unsafe-event-handlers` (warning).

| Rule                       | Checks                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `no-react-imports`         | React and React DOM imports                                |
| `no-react-hooks`           | React hooks                                                |
| `no-unsafe-event-handlers` | Inline handler strings and function-valued HTML attributes |
| `no-javascript-urls`       | `javascript:` links                                        |
| `no-context`               | React context                                              |
| `no-refs`                  | React refs                                                 |
| `no-global-jsx-namespace`  | Global JSX types instead of Vincle types                   |

[Documentation](https://vincle.cjean.fr) ·
[Rule implementations](https://github.com/cjean-fr/vincle/tree/main/packages/eslint-plugin/src/rules)

MIT © Christophe Jean
