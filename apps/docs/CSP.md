# Documentation CSP

Local CSP helpers for documentation generation and the development server.

```tsx
import { raw, renderToString } from "@vincle/core";

import { CspService, Script, withHash } from "./docs-src/lib/csp.js";

const csp = new CspService();
const HashedScript = withHash(Script, csp);
const bootstrap = raw(
  await renderToString(<HashedScript>const name = {JSON.stringify(user.name)};</HashedScript>),
);
const header = csp.getCSPHeader();
// Set Content-Security-Policy on the response before sending the body,
// or put the policy in a meta element before the authorized scripts.
```

Without a policy argument, the service uses the documentation policy, including its font providers. An explicit policy replaces these defaults.

Create one service per document or response. `withHash` supports the exported
`Script` component and registers inline script bodies after Vincle's HTML
boundary protection. It renders children once. External scripts pass through
without inline hash registration; configure their allowed sources in the policy.
Plain `Script` needs no service or context.

`await csp.addScript(protectedBody)` returns an unquoted `sha256-…` hash and
collects it. Pass the emitted body without tags, after protecting it for HTML.
`getCSPHeader()` returns the policy value with deduplicated, quoted hashes;
`clear()` removes collected hashes and preserves the base policy. Reads do not
wait for pending additions: await additions or rendering first. In-flight
additions started before `clear()` do not populate the new collection.

If the policy defines `script-src-elem`, hashes go there. Otherwise they go to
`script-src`, preserving its sources or inheriting `default-src` sources.
Adding hashes to a directive containing `'unsafe-inline'` makes browsers ignore
that keyword, so configure the base policy accordingly.

Hashes authorize code; they do not sanitize JavaScript. Serialize untrusted
values correctly. Collecting scripts discovered throughout a whole page requires
finishing that render before sending its CSP. For streaming, prepare known
scripts first or use a per-response nonce with `<Script nonce={nonce}>` and a
matching policy. This helper does not buffer the rest of the document.
