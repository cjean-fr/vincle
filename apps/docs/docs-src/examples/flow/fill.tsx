import { Fill } from "@vincle/flow";

// Push content into a slot that already exists
// (<Slot name="cart-badge">).
// <Fill> renders nothing itself — just registers the content.
function LiveBadge({ count }: { count: number }) {
  return <Fill target="cart-badge">{() => <span>{count}</span>}</Fill>;
}

// merge: "replace" | "append" | "prepend" | "before" | "after"
function AppendLog() {
  return (
    <Fill target="log-list" merge="append">
      {() => <li>New entry</li>}
    </Fill>
  );
}
