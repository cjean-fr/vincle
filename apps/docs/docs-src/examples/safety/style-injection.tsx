// @jsxImportSource @vincle/core
import { renderToString } from "@vincle/core";

const untrusted = "red;position:fixed;top:0;left:0;width:100vw;height:100vw";

// A style object is inspected: a property name carrying CSS syntax is dropped,
// and a value carrying `;` or `\` is CSS-escaped — the browser reads `\;` as a
// literal `;`, so the smuggled declarations stay inside the value.
const bag = await renderToString(<div style={{ color: untrusted }} />);

// Legitimate values survive that escaping unchanged in meaning.
const dataUri = await renderToString(
  <div style={{ background: "url(data:image/png;base64,iVBORw0KGgo=)" }} />,
);

// A style *string* is an author-written declaration list: it is escaped for the
// attribute, not parsed as CSS. Never build one from untrusted input.
const asString = await renderToString(<div style={untrusted} />);

export const output = [bag, dataUri, asString];
