import { Defer } from "@vincle/flow";

declare function loadSummary(): Promise<string>;
declare function loadResults(): Promise<string[]>;

export async function Summary() {
  return <p>{await loadSummary()}</p>;
}

export async function Results() {
  const results = await loadResults();
  return (
    <ul>
      {results.map((result) => (
        <li>{result}</li>
      ))}
    </ul>
  );
}

export function SearchPage() {
  return (
    <Defer.Group>
      <Defer target="summary" fallback={<p>Loading summary…</p>}>
        <Summary />
      </Defer>
      <Defer target="results" fallback={<p>Loading results…</p>}>
        <Results />
      </Defer>
    </Defer.Group>
  );
}
