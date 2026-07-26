import { Template } from "@vincle/flow";
import type { VNode } from "@vincle/core";

async function HeavyDashboard() {
  const data = await fetch("https://api.example.com/dashboard");
  const json = await data.json();
  return <pre>{JSON.stringify(json, null, 2)}</pre>;
}

// fallback is shown in the shell immediately.
<Template target="dashboard" fallback={<p>Loading dashboard…</p>}>
  {
    // @ts-expect-error Async component supported at runtime
    <HeavyDashboard /> as unknown as VNode
  }
</Template>;
