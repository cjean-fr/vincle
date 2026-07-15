import { Template } from "@vincle/flow";

// @ts-expect-error — TS1062: async component returns Promise<VNode>, TS7 detects thenable cycle (runtime OK)
async function HeavyDashboard({ signal }: { signal: AbortSignal }) {
  const data = await fetch("https://api.example.com/dashboard", {
    signal,
  });
  const json = await data.json();
  return <pre>{JSON.stringify(json, null, 2)}</pre>;
}

// fallback is shown in the shell immediately.
// The factory receives an AbortSignal — if the request takes too long
// or the client disconnects, the fetch aborts automatically.
<Template target="dashboard" fallback={<p>Loading dashboard…</p>}>
  {(signal) => <HeavyDashboard signal={signal} />}
</Template>;
