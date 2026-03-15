import type { RuleModule } from "../types.js";

/**
 * Inline event handlers are not forbidden — `@vincle/core` serializes a string
 * handler like any other attribute, escaped. This rule is where they get
 * discouraged, because the runtime deliberately says nothing: an SSR renderer
 * emits the same tree thousands of times a second, so a per-render `console.warn`
 * is a log flood. Lint says it once, at the source, before it ships.
 *
 * The two cases are not the same problem and do not get the same severity:
 *
 *   onClick="submit()"     renders, and works. Costs a `script-src
 *                          'unsafe-inline'` CSP allowance, and the code inside the
 *                          string is neither bundled, minified, nor type-checked.
 *                          → warning.
 *   onClick={() => {…}}    never works. There is no client runtime to attach a
 *                          function to, and a function cannot be serialized to
 *                          HTML, so rendering throws.
 *   class={() => {…}}      same failure, on any attribute. A function passed to
 *                          *any* attribute of an HTML element is a render-time
 *                          error, not just on event handlers. → error.
 *
 * Component props are ignored entirely: `<Foo onClick={fn} />` passes the
 * function to the component, which is not serialized — that is a normal
 * client-side callback, not a render error.
 */

/** Only a literal function expression is certainly a function at lint time. */
function isFunctionExpression(node: any): boolean {
  return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
}

/** True when the attribute sits on a component (non-lowercase tag), not an HTML element. */
function isComponentAttribute(node: any): boolean {
  const opening = node.parent;
  if (opening?.type !== "JSXOpeningElement") return false;
  const tag = opening.name;
  if (tag?.type !== "JSXIdentifier") return true; // member/namespaced name → component
  const first = tag.name[0];
  return first === undefined || first !== first.toLowerCase() || first === first.toUpperCase();
}

export const noUnsafeEventHandlers: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Report functions passed to attributes (rendering throws), and discourage inline event handler strings.",
    },
    schema: [],
    messages: {
      inlineHandler:
        "Inline event handler \"{{name}}\" is rendered as an HTML attribute. It works, but it requires a `script-src 'unsafe-inline'` CSP allowance and the code in the string is never bundled or type-checked. Prefer attaching the listener from a script.",
      functionAttribute:
        '"{{name}}" was passed a function. @vincle/core renders attributes to HTML, and a function cannot be serialized — rendering throws. Pass a string, or attach the listener client-side.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.type !== "JSXIdentifier") return;
        if (isComponentAttribute(node)) return;

        const name: string = node.name.name;
        const value = node.value;
        const expression = value?.type === "JSXExpressionContainer" ? value.expression : undefined;

        // A function fails on any attribute, not just event handlers.
        if (isFunctionExpression(expression)) {
          context.report({
            node,
            messageId: "functionAttribute",
            data: { name },
          });
          return;
        }

        // A string on an event handler works but ships uncached code under a
        // `script-src 'unsafe-inline'` allowance — discouraged, not broken.
        if (/^on[A-Za-z]/.test(name)) {
          context.report({
            node,
            messageId: "inlineHandler",
            data: { name },
          });
        }
      },
    };
  },
};
