import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "@vincle/core/jsx-runtime";
import { useMDXComponents as _provideComponents } from "file:///home/cjean/Workspace/vincle/docs-src/mdx-components.jsx";
function _createMdxContent(props) {
  const _components = Object.assign(
    {
      a: "a",
      code: "code",
      div: "div",
      h1: "h1",
      h2: "h2",
      li: "li",
      p: "p",
      table: "table",
      tbody: "tbody",
      td: "td",
      th: "th",
      thead: "thead",
      tr: "tr",
      ul: "ul",
    },
    _provideComponents(),
    props.components,
  );
  const { CodeBlock, CodeExample, Tabs } = _components;
  if (!Tabs) _missingMdxReference("Tabs", true);
  if (!CodeBlock) _missingMdxReference("CodeBlock", true);
  if (!CodeExample) _missingMdxReference("CodeExample", true);
  return _jsxs(_Fragment, {
    children: [
      _jsx(_components.h1, {
        id: "installation",
        children: "Installation",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          _jsx(_components.code, { children: "@vincle/core" }),
          " has zero runtime dependencies. Install it and configure\nTypeScript — that's all.",
        ],
      }),
      "\n",
      _jsx(_components.h2, {
        id: "package-manager",
        children: "Package manager",
      }),
      "\n",
      _jsx(Tabs, {
        syncKey: "pkg-manager",
        tabs: [
          {
            label: "npm",
            content: _jsx(CodeBlock, {
              code: "npm install @vincle/core",
              language: "bash",
            }),
          },
          {
            label: "bun",
            content: _jsx(CodeBlock, {
              code: "bun add @vincle/core",
              language: "bash",
            }),
          },
        ],
      }),
      "\n",
      _jsx(_components.h2, {
        id: "typescript-configuration",
        children: "TypeScript configuration",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Set ",
          _jsx(_components.code, { children: "jsxImportSource" }),
          " in your ",
          _jsx(_components.code, { children: "tsconfig.json" }),
          " so that JSX files don't need any\nexplicit import:",
        ],
      }),
      "\n",
      _jsx(CodeExample, {
        src: "guide/getting-started/tsconfig.json",
        meta: "tsconfig.json",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "optional-types-react",
        children: "Optional: @types/react",
      }),
      "\n",
      _jsxs(_components.p, {
        children: [
          "Installing ",
          _jsx(_components.code, { children: "@types/react" }),
          " gives you per-element attribute autocomplete (e.g.\n",
          _jsx(_components.code, { children: "src" }),
          " on ",
          _jsx(_components.code, { children: "<img>" }),
          ", ",
          _jsx(_components.code, { children: "href" }),
          " on ",
          _jsx(_components.code, { children: "<a>" }),
          "). It is not required — ",
          _jsx(_components.code, { children: "@vincle/core" }),
          " works\nwithout it.",
        ],
      }),
      "\n",
      _jsx(CodeExample, {
        src: "guide/getting-started/tsconfig-with-react.json",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "what-you-get",
        children: "What you get",
      }),
      "\n",
      _jsx(_components.div, {
        className: "docs-table-wrapper",
        children: _jsxs(_components.table, {
          children: [
            "\n",
            _jsxs(_components.thead, {
              children: [
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsx(_components.th, { children: "Export" }),
                    "\n",
                    _jsx(_components.th, { children: "Purpose" }),
                    "\n",
                  ],
                }),
                "\n",
              ],
            }),
            "\n",
            _jsxs(_components.tbody, {
              children: [
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsx(_components.td, {
                      children: _jsx(_components.code, {
                        children: "renderToString",
                      }),
                    }),
                    "\n",
                    _jsx(_components.td, {
                      children: "Renders a JSX tree to an HTML string",
                    }),
                    "\n",
                  ],
                }),
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsx(_components.td, {
                      children: _jsx(_components.code, { children: "raw" }),
                    }),
                    "\n",
                    _jsx(_components.td, {
                      children: "Marks a trusted HTML string (no escaping)",
                    }),
                    "\n",
                  ],
                }),
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsx(_components.td, {
                      children: _jsx(_components.code, {
                        children: "Fragment",
                      }),
                    }),
                    "\n",
                    _jsxs(_components.td, {
                      children: [
                        "Standard JSX fragment (",
                        _jsx(_components.code, { children: "<>…</>" }),
                        ")",
                      ],
                    }),
                    "\n",
                  ],
                }),
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsxs(_components.td, {
                      children: [
                        _jsx(_components.code, { children: "context" }),
                        " / ",
                        _jsx(_components.code, { children: "withScope" }),
                      ],
                    }),
                    "\n",
                    _jsx(_components.td, {
                      children: "Scoped context for per-request isolation",
                    }),
                    "\n",
                  ],
                }),
                "\n",
                _jsxs(_components.tr, {
                  children: [
                    "\n",
                    _jsx(_components.td, {
                      children: _jsx(_components.code, {
                        children: "jsx-runtime",
                      }),
                    }),
                    "\n",
                    _jsx(_components.td, {
                      children: "The JSX transform entry point (auto-wired)",
                    }),
                    "\n",
                  ],
                }),
                "\n",
              ],
            }),
            "\n",
          ],
        }),
      }),
      "\n",
      _jsx(_components.p, {
        children:
          "Everything else is internal. There is no plugin registry, no provider tree, no\nconfig object to maintain.",
      }),
      "\n",
      _jsx(_components.h2, {
        id: "where-to-next",
        children: "Where to next",
      }),
      "\n",
      _jsxs(_components.ul, {
        children: [
          "\n",
          _jsxs(_components.li, {
            children: [
              _jsx(_components.a, {
                href: "/guide/getting-started/first-render",
                children: "First render",
              }),
              " — your first component",
            ],
          }),
          "\n",
          _jsxs(_components.li, {
            children: [
              _jsx(_components.a, {
                href: "/guide/getting-started/typescript-setup",
                children: "TypeScript setup",
              }),
              " — Deno, esbuild",
            ],
          }),
          "\n",
        ],
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
