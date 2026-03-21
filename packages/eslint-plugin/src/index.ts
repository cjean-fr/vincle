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

const plugin = {
  meta: { name: "vincle" },
  rules,
  configs: {} as Record<string, any>,
};

const configs = {
  recommended: {
    plugins: {
      "@vincle/core": plugin,
    },
    rules: {
      "@vincle/core/no-react-imports": "error",
      "@vincle/core/no-react-hooks": "error",
      "@vincle/core/no-unsafe-event-handlers": "warn",
      "@vincle/core/no-javascript-urls": "error",
      "@vincle/core/no-context": "error",
      "@vincle/core/no-refs": "error",
      "@vincle/core/no-global-jsx-namespace": "error",
    },
  },
};

plugin.configs = configs;

export default plugin;
export { rules, configs };
