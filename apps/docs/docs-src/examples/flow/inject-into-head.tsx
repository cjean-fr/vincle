import { injectIntoHead } from "@vincle/flow/utils";

const shell = "<html><body>…</body></html>";
const patched = injectIntoHead(shell, `<link rel="stylesheet" href="/app.css">`);

export const output = patched;
