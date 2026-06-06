import { Template } from "@vincle/flow";

// Push content into a slot that already exists
// (<Slot name="cart-badge">).
// <Template> with a factory renders nothing itself — just registers the content.
function LiveBadge({ count }: { count: number }) {
  return <Template target="cart-badge">{() => <span>{count}</span>}</Template>;
}

// merge: "replace" | "append" | "prepend" | "before" | "after"
function AppendLog() {
  return (
    <Template target="log-list" merge="append">
      {() => <li>New entry</li>}
    </Template>
  );
}
