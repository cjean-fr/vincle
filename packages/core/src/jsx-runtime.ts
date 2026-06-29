import type {
  Component,
  VincleNode,
  HTMLAttributes,
  JSX,
} from "./core/types.js";
import { RawString } from "./core/types.js";
import { renderChild } from "./utils/render-child.js";
import { renderElement } from "./utils/render-element.js";

export type { JSX };
export { jsxAttr, jsxEscape, jsxTemplate } from "./precompile.js";

const ANNOTATED_ERROR = Symbol("annotated");

/**
 * Prefix an error's message with the component that threw, exactly once.
 *
 * Mutates the original error rather than wrapping it, so the type, `cause`, and
 * any custom properties survive. The innermost component wins: the `ANNOTATED`
 * marker stops outer `jsx` calls from re-prefixing as the error unwinds.
 *
 * The stack is left untouched on purpose: by the time we catch, the throwing
 * frame is already unwound and survives only in the frozen stack string, so
 * removing the runtime's own frames means parsing that string — brittle across
 * runtimes and a no-op under minification. The `[Component]` prefix carries the
 * attribution robustly instead.
 */
function annotateError(error: unknown, tag: Component<any>): unknown {
  if (error instanceof Error) {
    if (!(ANNOTATED_ERROR in error)) {
      error.message = `[${tag.name || "<anonymous>"}] ${error.message}`;
      Object.defineProperty(error, ANNOTATED_ERROR, { value: true });
    }
    return error;
  }
  const annotated = new Error(
    `[${tag.name || "<anonymous>"}] ${String(error)}`,
  );
  Object.defineProperty(annotated, ANNOTATED_ERROR, { value: true });
  return annotated;
}

/**
 * Automatic JSX Transform — production variant.
 *
 * Per the JSX automatic runtime spec, signature is `(type, props, key?)`. The
 * `key` is diagnostic, NOT a child. Children always live in `props.children`.
 *
 * This function does not accept variadic positional children. To pass children,
 * use an explicit `children` property on the `props` object.
 */
export function jsx<P extends {} = {}>(
  tag: string | Component<P>,
  props: P,
  _key?: unknown,
): JSX.Element {
  const p = (props ?? {}) as P & { children?: any };

  if (typeof tag === "function") {
    try {
      const result = renderChild(tag(p));
      if (typeof result === "string") return new RawString(result);
      return result.then(
        (s) => new RawString(s),
        (e) => Promise.reject(annotateError(e, tag)),
      );
    } catch (e) {
      throw annotateError(e, tag);
    }
  }

  return renderElement(tag, p as HTMLAttributes, p.children as VincleNode);
}

/**
 * Automatic JSX Transform — multi-children variant. Same shape as `jsx`;
 * emitted by transforms when children are statically known to be an array.
 */
export const jsxs: typeof jsx = jsx;

/**
 * JSX Fragment — groups children without wrapping them in a DOM element.
 *
 * Use the shorthand `<>...</>` syntax in JSX; the runtime resolves it to this
 * function. Returns its children unchanged, so they are flattened into the
 * parent element's content during rendering.
 *
 * @example
 * ```tsx
 * const List = () => (
 * <>
 * <li>one</li>
 * <li>two</li>
 * </>
 * );
 * await renderToString(<ul><List /></ul>);
 * // => "<ul><li>one</li><li>two</li></ul>"
 * ```
 */
export function Fragment({
  children,
}: {
  children?: VincleNode;
}): VincleNode | undefined {
  return children;
}
