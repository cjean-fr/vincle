import { Defer } from "@vincle/flow";

import { Results, Summary } from "./defer-group";

export function SearchPage() {
  return (
    <Defer.Group together>
      <Defer target="summary" fallback={<p>Loading summary…</p>}>
        <Summary />
      </Defer>
      <Defer target="results" fallback={<p>Loading results…</p>}>
        <Results />
      </Defer>
    </Defer.Group>
  );
}
