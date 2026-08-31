// @jsxImportSource @vincle/core
import { renderToString, raw } from "@vincle/core";

// In content position, raw() is verbatim — that is the whole point.
const content = await renderToString(<div>{raw("<strong>Bold</strong>")}</div>);

// In attribute position it is verbatim too, except `"`: a value that carried one
// would end the attribute and reopen the tag. Escaping it changes nothing a
// parser reads back — the value is entity-decoded before CSS, JS or the DOM see it.
const quoted = await renderToString(<div style={raw('font-family:"Inter"')} />);

// So an attribute cannot be broken out of, even through raw().
const attack = await renderToString(<a title={raw('" onmouseover="alert(1)')}>x</a>);

// A URL attribute holding a RawString still skips the scheme check, by design:
// raw() means "I vouch for this value".
const vouched = await renderToString(<a href={raw("javascript:doIt()")}>run</a>);

export const output = [content, quoted, attack, vouched];
