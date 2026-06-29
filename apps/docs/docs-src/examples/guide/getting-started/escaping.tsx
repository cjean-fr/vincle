import { renderToString, raw } from "@vincle/core";

declare const markdownRenderer: { render(md: string): Promise<string> };
declare const post: { body: string };

// User input is HTML-escaped automatically
const userInput = '<script>alert("xss")</script>';
const html = await renderToString(<p>{userInput}</p>);
// → '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>'

// Use raw() only for trusted HTML you generated yourself
const trustedHtml = await markdownRenderer.render(post.body);
const html2 = await renderToString(<article>{raw(trustedHtml)}</article>);
