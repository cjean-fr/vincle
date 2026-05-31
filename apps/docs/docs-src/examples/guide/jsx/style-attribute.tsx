import { renderToString } from "@vincle/core";

// String style
const html1 = await renderToString(<p style="color: red; font-size: 1.5rem;">Hello</p>);

// Object style (camelCase → kebab-case conversion)
const html2 = await renderToString(<p style={{ color: "red", fontFamily: "sans-serif" }}>Hello</p>);
