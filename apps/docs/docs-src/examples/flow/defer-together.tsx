import { Defer } from "@vincle/flow";

import { Results, Summary } from "./defer-sequence";

export function SearchPage() {
  return (
    <Defer.Together>
      <Defer target="summary" fallback={<p>Loading summary…</p>}>
        <Summary />
      </Defer>
      <Defer target="results" fallback={<p>Loading results…</p>}>
        <Results />
      </Defer>
    </Defer.Together>
  );
}
