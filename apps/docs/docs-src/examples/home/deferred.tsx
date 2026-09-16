import { Defer, renderToStream } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

import { Results } from "./results";

function Page() {
  return (
    <main>
      <h1>Search results</h1>
      <Defer target="results" fallback={<p>Loading results…</p>}>
        <Results />
      </Defer>
    </main>
  );
}

const stream = renderToStream(() => <Page />, NativeAdapter);
