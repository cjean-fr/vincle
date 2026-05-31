import { renderToString } from "@vincle/core";

// `class` wins, `className` is dropped
const classes = await renderToString(<div className="foo" class="bar" />);

// No conflict — only one name given
const single = await renderToString(<label htmlFor="email">Email</label>);

// `class`/`className` is the only pair typed in both spellings. Every other
// HTML name reaches an element through a spread, and the same rule applies:
const spread = await renderToString(<label {...{ htmlFor: "a", for: "b" }}>Label</label>);

export const output = [classes, single, spread];
