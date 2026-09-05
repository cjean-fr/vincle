/**
 * Reading a props bag safely.
 *
 * A leaf module on purpose — it imports nothing, so both ways out of `jsx()`
 * (the static fold in `serialize.ts`, the `VNode` in `jsx-runtime.ts`) can ask
 * the same question and get the same answer.
 *
 * @module
 */

/**
 * `props.children`, but only when the props bag actually owns it.
 *
 * `props["children"]` walks the prototype chain, so an enumerable `children` on
 * `Object.prototype` — what a prototype-pollution bug in the application writes
 * — would become the children of every element rendered with no children of its
 * own. The plain read stays the fast path: the prototype is consulted only when
 * the read finds something, which for an element without children means one
 * property miss and nothing more.
 */
export function ownChildren(props: Record<string, unknown>): unknown {
  const children = props["children"];
  if (children === undefined) return undefined;
  if ("children" in Object.prototype && !Object.hasOwn(props, "children")) return undefined;
  return children;
}
