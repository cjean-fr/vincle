import { ESLintUtils } from "@typescript-eslint/utils";

// React's stateful/effect hooks, which have no meaning in static rendering.
// `useContext` is deliberately absent: it is part of @vincle/core's own
// (synchronous, scope-based) public API, so flagging every `use*` identifier
// would reject idiomatic @vincle/core code.
const REACT_HOOKS = new Set<string>([
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useReducer",
  "useRef",
  "useImperativeHandle",
  "useCallback",
  "useMemo",
  "useTransition",
  "useDeferredValue",
  "useId",
  "useSyncExternalStore",
  "useDebugValue",
  "useActionState",
  "useFormStatus",
  "useOptimistic",
]);

export const noReactHooks = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React hooks usage.",
    },

    schema: [],
    messages: {
      noHook:
        "{{name}} is not compatible with @vincle/core. Static rendering only.",
      useState:
        "useState is not compatible with @vincle/core. Extract state as props.",
      useEffect:
        "useEffect is not compatible with @vincle/core. Fetch data before render.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          REACT_HOOKS.has(node.callee.name)
        ) {
          const name = node.callee.name;
          let messageId: "noHook" | "useState" | "useEffect" = "noHook";

          if (name === "useState") messageId = "useState";
          else if (name === "useEffect") messageId = "useEffect";

          context.report({
            node,
            messageId,
            data: {
              name,
            },
          });
        }
      },
    };
  },
});
