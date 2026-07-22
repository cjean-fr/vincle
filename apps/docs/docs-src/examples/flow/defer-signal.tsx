import { Template } from "@vincle/flow";

// @ts-expect-error — TS1062: async component returns Promise<VNode>, TS7 detects thenable cycle (runtime OK)
async function HeavyDashboard() {
  const data = await fetch("https://api.example.com/dashboard");
  const json = await data.json();
  return <pre>{JSON.stringify(json, null, 2)}</pre>;
}

// fallback is shown in the shell immediately.
<Template target="dashboard" fallback={<p>Loading dashboard…</p>}>
  <HeavyDashboard />
</Template>;
