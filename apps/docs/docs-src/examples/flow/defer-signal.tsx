import { Template } from "@vincle/flow";

async function HeavyDashboard() {
  const data = await fetch("https://api.example.com/dashboard");
  const json = await data.json();
  return <pre>{JSON.stringify(json, null, 2)}</pre>;
}

// fallback is shown in the shell immediately.
<Template target="dashboard" fallback={<p>Loading dashboard…</p>}>
  <HeavyDashboard />
</Template>;
