import { renderToString, raw } from "@vincle/core";

// User input is HTML-escaped automatically
const userInput = '<script>alert("xss")</script>';
const html = await renderToString(<p>{userInput}</p>);

// Use raw() only for trusted HTML you generated yourself
const trustedHtml = "<em>rendered from your own markdown</em>";
const html2 = await renderToString(<article>{raw(trustedHtml)}</article>);

export const output = [html, html2];
