// @jsxImportSource @vincle/core
import { renderToString, raw } from "@vincle/core";

const userInput = '<script>alert("XSS")</script>';

// ❌ NEVER do this with untrusted input
const unsafe = await renderToString(<div>{raw(userInput)}</div>);

// ✅ This is safe (default behavior - always escaped)
const safe = await renderToString(<div>{userInput}</div>);

// ✅ raw() is safe with trusted sources (markdown, templates, your code)
const trustedHtml = "<strong>Hello</strong>";
const result = await renderToString(<p>{raw(trustedHtml)}</p>);

export const output = [unsafe, safe, result];
