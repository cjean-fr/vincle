import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noContext } from "./no-context";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-context", noContext, {
  valid: [
    "const Foo = createSomethingElse();",
    "const Foo = React.createSomethingElse();",
    "const ToastProvider = {}; <ToastProvider.Provider />;",
    'import { createContext } from "@vincle/core"; const Foo = createContext("x"); <Foo.Provider value="y" />;',
    'const Foo = createContext("x"); <Foo.Provider value="y" />;',
  ],
  invalid: [
    {
      code: 'import { createContext } from "react"; const Foo = createContext(); <Foo.Provider />;',
      errors: [{ messageId: "noContext" }, { messageId: "noContext" }],
    },
    {
      code: 'import React from "react"; const Foo = React.createContext(); <Foo.Provider />;',
      errors: [{ messageId: "noContext" }, { messageId: "noContext" }],
    },
    {
      code: 'import { createContext } from "react"; createContext();',
      errors: [{ messageId: "noContext" }],
    },
    {
      code: 'import * as React from "react"; React.createContext();',
      errors: [{ messageId: "noContext" }],
    },
  ],
});
