# Error Boundaries for @vincle/core

**Date:** 2026-07-08
**Status:** Draft
**Phase 1:** `@vincle/core` — lazy descriptors + ErrorBoundary component
**Phase 2:** `@vincle/flow` — streaming error boundaries (future)

---

## Problem

`@vincle/core` has no error isolation mechanism. If any component throws during
rendering, the entire page fails. The JSX runtime (`jsx-runtime.ts`) annotates
errors with the component name but always re-throws — there is no fallback UI,
no containment, no way to recover from a failed subtree.

A naive `<ErrorBoundary>` component cannot work with the current architecture
because JSX evaluates children eagerly as function arguments:

```
jsx(ErrorBoundary, { children: jsx(Child, {}) })
                    ^---------^  ^--------^
                    fallback      💥 Child thrown BEFORE ErrorBoundary runs
```

The child's `jsx()` call completes (or throws) before the parent's `jsx()` is
even entered. An ErrorBoundary component never has a chance to catch errors
from its JSX children.

---

## Solution: Lazy Descriptors

Replace eager evaluation in `jsx()` with lightweight descriptor objects
`{ type, props, key }`. Component execution moves from `jsx()` into the
render pipeline (`renderChild` → `renderDescriptor`), where error boundaries
can intercept.

### Before (eager)

```ts
jsx(Profile, { userId: 1 })
  → execute Profile({ userId: 1 })
  → render result to RawString
  → return RawString | Promise<RawString>
```

### After (lazy)

```ts
jsx(Profile, { userId: 1 })
  → return { type: Profile, props: { userId: 1 } }
  → ZERO execution in jsx()
```

---

## Architecture

### Types

```ts
interface Descriptor {
  type: string | Component<any>;
  props: Record<string, unknown>;
  key?: unknown;
}

type VincleNode =
  | string | number | boolean | null | undefined
  | RawString
  | Promise<VincleNode>
  | VincleNode[]
  | Iterable<VincleNode> | AsyncIterable<VincleNode>
  | Descriptor;                         // ← new

type JSX.Element = Descriptor;          // ← changed from RawString
```

### jsx-runtime.ts — simplified

```ts
export function jsx(type: any, props: any, key?: unknown): Descriptor {
  return { type, props, key };
}

export const jsxs = jsx;

export function Fragment({ children }: { children?: VincleNode }): VincleNode {
  return children;
}
```

No try/catch, no `renderChild`, no `renderElement`, no `annotateError`.
All execution logic moves to the pipeline.

### renderDescriptor — new pipeline node

```
renderChild(value)
  → isDescriptor(value)?
    → renderDescriptor(desc, parentTag)
      → typeof type === "string"?
        → renderElement(type, props, props.children)  // unchanged
      → typeof type === "function"?
        → ERROR_BOUNDARY_SYMBOL in type?
          → renderBoundary(desc, parentTag)            // special handling
        → try { await type(props); renderChild(result) }
          → catch { annotateError + throw }
```

### renderBoundary — error interception

```
renderBoundary(desc, parentTag)
  → withScope()
    → push { fallback } onto boundary stack (context)
    → try { await renderChild(desc.props.children, parentTag) }
      → 💥 child throws → propagates naturally via async/await
    → catch
      → console.error
      → pop boundary from stack
      → render fallback(error)
```

### renderChild — new branch

```ts
// In render-child.ts, before the fallback escape hatch:
if (isDescriptor(value)) {
  return renderDescriptor(value, parentTag);
}

function isDescriptor(v: unknown): v is Descriptor {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    "props" in v &&
    (typeof (v as any).type === "string" ||
     typeof (v as any).type === "function")
  );
}
```

---

## ErrorBoundary Component

```ts
// error-boundary.tsx — internal symbol
const ERROR_BOUNDARY_SYMBOL = Symbol("vincle/error-boundary");

export function ErrorBoundary({ children, fallback }: {
  children?: VincleNode;
  fallback: VincleNode | ((error: unknown) => VincleNode);
}): VincleNode {
  return children; // never called by pipeline; recognized via symbol
}
ErrorBoundary[ERROR_BOUNDARY_SYMBOL] = true;
```

The symbol is **not exported**. Only the built-in `ErrorBoundary` component
is public. The pipeline recognizes it by checking `ERROR_BOUNDARY_SYMBOL in type`.

### API

```tsx
import { ErrorBoundary } from "@vincle/core";

<ErrorBoundary fallback={<p>Section error</p>}>
  <Profile userId={1} />
</ErrorBoundary>

// Fallback can receive the error:
<ErrorBoundary fallback={(e) => <p>{e.message}</p>}>
  <Profile userId={1} />
</ErrorBoundary>
```

### Behavior

- Catches synchronous throws and Promise rejections from all descendants
- Renders fallback in place of the errored subtree
- `console.error` by default (like React)
- Transparent — produces no wrapping HTML
- Nested boundaries: inner catches first; if inner fallback throws, outer catches

---

## Interaction with Existing Features

| Feature | Change |
|---------|--------|
| `raw()` / `RawString` | Unchanged — still handled by `renderChild` |
| `dangerouslySetInnerHTML` | Unchanged — handled by `renderElement` |
| `Fragment` | Unchanged — natural descriptor handling |
| `precompile.ts` exports | Unchanged — direct-to-string fast path coexists |
| `renderToString` | Unchanged — delegates to `renderChild` |
| `context` / `withScope` | Unchanged — used by `renderBoundary` internally |
| `renderElement` | Unchanged — called from `renderDescriptor` |
| `renderAttributes` | Unchanged |

---

## Phase 2: @vincle/flow (future)

- Adapt `streamFlow` and `createFlowStream` to lazy descriptor resolution
- Extend per-fragment `onError` to use the general ErrorBoundary mechanism
- Protect the shell stream with ErrorBoundary
- No timeline — designed for compatibility when the time comes

---

## Implementation Plan

### Files to create

| File | Contents |
|------|----------|
| `core/src/render-descriptor.ts` | `renderDescriptor()`, `renderBoundary()`, `annotateError()` |
| `core/src/error-boundary.tsx` | `ErrorBoundary` component + `ERROR_BOUNDARY_SYMBOL` |
| `core/src/internal.ts` | Shared internal symbols/constants |

### Files to modify

| File | Change |
|------|--------|
| `core/src/core/types.ts` | Add `Descriptor` interface, `isDescriptor()` guard |
| `core/src/jsx-runtime.ts` | Replace body with `return { type, props, key }` |
| `core/src/jsx-dev-runtime.ts` | Same as jsx-runtime |
| `core/src/utils/render-child.ts` | Add `isDescriptor()` branch before fallback |
| `core/src/index.ts` | Export `ErrorBoundary` |

### Files unaffected

`render-element.ts`, `render-attributes.ts`, `escape.ts`, `context.ts`,
`precompile.ts`, `void-elements.ts`, `core/types.ts` (types only change)

### Tests

- `render-descriptor.test.ts` — elements, sync/async components, error cases
- `error-boundary.test.tsx` — sync catch, async catch, nested boundaries,
  fallback types, error propagation without boundary
- `jsx-runtime.test.ts` — updated for descriptor output
