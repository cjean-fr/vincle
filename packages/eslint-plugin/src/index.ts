import { noContext } from "./rules/no-context.js";
import { noGlobalJsxNamespace } from "./rules/no-global-jsx-namespace.js";
import { noJavascriptUrls } from "./rules/no-javascript-urls.js";
import { noReactHooks } from "./rules/no-react-hooks.js";
import { noReactImports } from "./rules/no-react-imports.js";
import { noRefs } from "./rules/no-refs.js";
import { noUnsafeEventHandlers } from "./rules/no-unsafe-event-handlers.js";

const rules = {
  "no-react-imports": noReactImports,
  "no-react-hooks": noReactHooks,
  "no-unsafe-event-handlers": noUnsafeEventHandlers,
  "no-javascript-urls": noJavascriptUrls,
  "no-context": noContext,
  "no-refs": noRefs,
  "no-global-jsx-namespace": noGlobalJsxNamespace,
};

/**
 * One prefix, `@vincle`, everywhere.
 *
 * There were three: `meta.name` said `vincle`, `recommended` registered the
 * plugin under `@vincle/core` — the name of the *renderer*, which is not an
 * ESLint plugin at all — and the repo's own oxlint config used `vincle/`. A
 * user who enabled `recommended` and then tried to override one rule with any
 * of the other two spellings got "Could not find plugin".
 *
 * `@vincle` is ESLint's own convention for a package named
 * `@vincle/eslint-plugin`: the prefix is the scope. It is what someone writes
 * without reading the docs.
 */
const PREFIX = "@vincle";

const plugin = {
  meta: { name: PREFIX },
  rules,
  configs: {} as Record<string, any>,
};

const configs = {
  recommended: {
    plugins: {
      [PREFIX]: plugin,
    },
    rules: {
      [`${PREFIX}/no-react-imports`]: "error",
      [`${PREFIX}/no-react-hooks`]: "error",
      [`${PREFIX}/no-unsafe-event-handlers`]: "warn",
      [`${PREFIX}/no-javascript-urls`]: "error",
      [`${PREFIX}/no-context`]: "error",
      [`${PREFIX}/no-refs`]: "error",
      [`${PREFIX}/no-global-jsx-namespace`]: "error",
    },
  },
};

plugin.configs = configs;

export default plugin;
export { rules, configs };
