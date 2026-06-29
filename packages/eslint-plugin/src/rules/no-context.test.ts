import { noContext } from "./no-context";
import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

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
  ],
  invalid: [
    {
      code: "const Foo = createContext(); <Foo.Provider />;",
      errors: [{ messageId: "noContext" }, { messageId: "noContext" }],
    },
    {
      code: "const Foo = React.createContext(); <Foo.Provider />;",
      errors: [{ messageId: "noContext" }, { messageId: "noContext" }],
    },
    {
      code: "createContext();",
      errors: [{ messageId: "noContext" }],
    },
    {
      code: "React.createContext();",
      errors: [{ messageId: "noContext" }],
    },
  ],
});
