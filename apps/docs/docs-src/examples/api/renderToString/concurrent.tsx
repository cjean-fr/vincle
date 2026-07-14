import { renderToString } from "@vincle/core";

const PageA = () => <p>A</p>;
const PageB = () => <p>B</p>;

// Safe to call concurrently — scopes are fully isolated
const [pageA, pageB] = await Promise.all([renderToString(<PageA />), renderToString(<PageB />)]);
