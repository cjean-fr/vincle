import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "@vincle/core/jsx-runtime";
import { useMDXComponents as _provideComponents } from "file:///home/cjean/Workspace/vincle/docs-src/mdx-components.jsx";
function _createMdxContent(props) {
  const _components = Object.assign(
    {
      code: "code",
      h1: "h1",
      h2: "h2",
      h3: "h3",
      li: "li",
      p: "p",
      strong: "strong",
      ul: "ul",
    },
    _provideComponents(),
    props.components,
  );
  const { CodeExample } = _components;
  if (!CodeExample) _missingMdxReference("CodeExample", true);
  return _jsxs(_Fragment, {
    children: [
      _jsx(_components.h1, {
        id: "context-api",
        children: "Context API",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Pass data through a component tree without prop-drilling. Built on\n",
          _jsx(_components.code, { children: "AsyncLocalStorage" }),
          " — concurrent renders are fully isolated.",
        ],
      }),
      "\n",
      _jsx(_components.h2, {
        id: "when-to-use-context",
        children: "When to use context",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Context solves one problem: ",
          _jsx(_components.strong, {
            children:
              "passing data to deeply nested components without\nthreading it through every intermediate layer",
          }),
          ". Use it for:",
        ],
      }),
      "\n",
      _jsxs(_components.ul, {
        children: [
          "\n",
          _jsx(_components.li, {
            children: "Request-scoped state (current user, locale, theme)",
          }),
          "\n",
          _jsx(_components.li, {
            children: "Service instances (database, cache, logger)",
          }),
          "\n",
          _jsx(_components.li, {
            children: "Per-render configuration that many components need",
          }),
          "\n",
        ],
      }),
      "\n",
      _jsx(_components.p, {
        children:
          "If data only flows from parent to immediate child, pass it as a prop. Context\nadds indirection — use it only when the middle layers don't need the value.",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "api-signatures",
        children: "API signatures",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "The API consists of four functions: ",
          _jsx(_components.code, { children: "context" }),
          " creates a typed key,\n",
          _jsx(_components.code, { children: "setContext" }),
          " writes a value, ",
          _jsx(_components.code, { children: "useContext" }),
          " reads it, and ",
          _jsx(_components.code, { children: "withScope" }),
          " creates\nthe isolation boundary. ",
          _jsx(_components.code, { children: "snapshot" }),
          " captures the current scope for seeding\nnested scopes.",
        ],
      }),
      "\n",
      _jsx(CodeExample, { src: "api/context/signatures.ts" }),
      "\n",
      _jsx(_components.h3, {
        id: "context-key",
        children: "context(key)",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Creates a ",
          _jsx(_components.code, { children: "ContextKey<T>" }),
          " key. The ",
          _jsx(_components.code, { children: "key" }),
          " argument must be a non-empty namespaced\nstring (e.g. ",
          _jsx(_components.code, { children: '"@org/pkg:purpose"' }),
          "). This ensures same-name contexts across\nmodule boundaries share a Symbol instance. The type parameter ",
          _jsx(_components.code, { children: "T" }),
          " enforces\ntype safety at both write and read sites.",
        ],
      }),
      "\n",
      _jsx(_components.h3, {
        id: "setcontext-ctx-value",
        children: "setContext(ctx, value)",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Writes a value into the current scope. Must be called inside a ",
          _jsx(_components.code, { children: "withScope" }),
          "\ncallback — throws if no scope is active. The value is scoped to the enclosing\n",
          _jsx(_components.code, { children: "withScope" }),
          " call and all renders spawned inside it.",
        ],
      }),
      "\n",
      _jsx(_components.h3, {
        id: "usecontext-ctx",
        children: "useContext(ctx)",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Reads the value set by the nearest ",
          _jsx(_components.code, { children: "setContext" }),
          " call in the current scope.\nThrows if ",
          _jsx(_components.code, { children: "setContext" }),
          " for the given key has not been called — this is\nintentional: the absence of a required value is a programming error, not a\nruntime condition to silently ignore.",
        ],
      }),
      "\n",
      _jsx(_components.h3, {
        id: "withscope-fn-options",
        children: "withScope(fn, options?)",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Creates an isolated ",
          _jsx(_components.code, { children: "AsyncLocalStorage" }),
          " scope. Every ",
          _jsx(_components.code, { children: "setContext" }),
          " call inside\n",
          _jsx(_components.code, { children: "fn" }),
          " is contained within this scope. Render subtrees started inside the scope\ninherit the same context. The optional ",
          _jsx(_components.code, { children: "seed" }),
          " parameter pre-populates the\nscope with values from a parent scope (see ",
          _jsx(_components.code, { children: "snapshot" }),
          " below).",
        ],
      }),
      "\n",
      _jsx(_components.h2, {
        id: "basic-example",
        children: "Basic example",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Create a context key once at module level — one declaration, shared across all\nfiles that need it. Provide a value with ",
          _jsx(_components.code, { children: "setContext" }),
          " inside a ",
          _jsx(_components.code, { children: "withScope" }),
          ",\nand read it anywhere in the tree with ",
          _jsx(_components.code, { children: "useContext" }),
          ".",
        ],
      }),
      "\n",
      _jsx(CodeExample, { src: "api/context/basic.tsx" }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "The ",
          _jsx(_components.code, { children: "ThemeContext" }),
          " key is created once and exported. ",
          _jsx(_components.code, { children: "Layout" }),
          " sets the value in\na ",
          _jsx(_components.code, { children: "withScope" }),
          ". ",
          _jsx(_components.code, { children: "Header" }),
          " and ",
          _jsx(_components.code, { children: "Button" }),
          " read it independently, each receiving the\nsame value because they render inside the same scope.",
        ],
      }),
      "\n",
      _jsx(_components.h2, {
        id: "concurrent-renders",
        children: "Concurrent renders",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Each ",
          _jsx(_components.code, { children: "withScope" }),
          " call creates an isolated ",
          _jsx(_components.code, { children: "AsyncLocalStorage" }),
          " store. Two\nrenders running in parallel — even with different context values — never leak\nor interfere.",
        ],
      }),
      "\n",
      _jsx(CodeExample, { src: "api/context/concurrent.tsx" }),
      "\n",
      _jsx(_components.p, {
        children:
          "This is the key difference from a global variable or a module-level store:\ncontext is tied to the render call, not to the process.",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "snapshot",
        children: "snapshot()",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Captures all context values currently set in the active scope. Pass the result\nas ",
          _jsx(_components.code, { children: "seed" }),
          " to a new ",
          _jsx(_components.code, { children: "withScope" }),
          " to fork a child scope that inherits all parent\nvalues.",
        ],
      }),
      "\n",
      _jsx(CodeExample, { src: "api/context/snapshot.tsx" }),
      "\n",
      _jsx(_components.p, {
        children:
          "Useful when you need to spawn a sub-render (e.g. rendering an email template\nduring a page request) that sees the same context as its parent.",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "per-request-context",
        children: "Per-request context",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "The common pattern for HTTP servers: extract request metadata at the handler\nlevel, set it in context, and let any component read it without passing\n",
          _jsx(_components.code, { children: "req" }),
          " through every intermediate component.",
        ],
      }),
      "\n",
      _jsx(CodeExample, { src: "api/context/per-request.tsx" }),
      "\n",
      _jsx(_components.p, {
        children:
          "This pattern keeps your components framework-agnostic: they depend on a\ncontext key, not on the HTTP server library, framework, request object, or\nmiddleware chain.",
      }),
    ],
  });
}
function MDXContent(props = {}) {
  const { wrapper: MDXLayout } = Object.assign(
    {},
    _provideComponents(),
    props.components,
  );
  return MDXLayout
    ? _jsx(
        MDXLayout,
        Object.assign({}, props, { children: _jsx(_createMdxContent, props) }),
      )
    : _createMdxContent(props);
}
export default MDXContent;
function _missingMdxReference(id, component) {
  throw new Error(
    "Expected " +
      (component ? "component" : "object") +
      " `" +
      id +
      "` to be defined: you likely forgot to import, pass, or provide it.",
  );
}
