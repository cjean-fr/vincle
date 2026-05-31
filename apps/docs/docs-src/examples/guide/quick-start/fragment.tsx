import { Fragment } from "@vincle/core";

// Long form
const items = (
  <Fragment>
    <li>One</li>
    <li>Two</li>
  </Fragment>
);

// Shorthand (requires jsxImportSource in tsconfig)
const items2 = (
  <>
    <li>One</li>
    <li>Two</li>
  </>
);
