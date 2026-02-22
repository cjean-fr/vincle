import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

import { noReactImports } from "./no-react-imports";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
  },
});

ruleTester.run("no-react-imports", noReactImports, {
  valid: ['import { renderToString } from "@vincle/core";', 'import fs from "fs";'],
  invalid: [
    {
      code: 'import React from "react";',
      errors: [{ messageId: "noReactImport" }],
    },
    {
      code: 'import { useState } from "react";',
      errors: [{ messageId: "noReactImport" }],
    },
    {
      code: 'import ReactDOM from "react-dom";',
      errors: [{ messageId: "noReactImport" }],
    },
  ],
});
