import type { RuleModule } from "../types.js";

/**
 * Inline event handlers are not forbidden — `@vincle/core` serializes a string
 * handler like any other attribute, escaped. This rule is where they get
 * discouraged, because the runtime deliberately says nothing: an SSR renderer
 * emits the same tree thousands of times a second, so a per-render `console.warn`
 * is a log flood. Lint says it once, at the source, before it ships.
 *
 * The two cases are not the same problem and do not get the same message:
 *
 *   onClick="submit()"     renders, and works. Costs a `script-src
 *                          'unsafe-inline'` CSP allowance, and the code inside the
 *                          string is neither bundled, minified, nor type-checked.
 *   onClick={() => {…}}    never works. There is no client runtime to attach a
 *                          function to, and a function cannot be serialized to
 *                          HTML, so rendering throws.
 */

/** Only a literal function expression is certainly a function at lint time. */
function isFunctionExpression(node: any): boolean {
  return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
}

export const noUnsafeEventHandlers: RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Discourage inline event handler attributes, and report handlers passed a function (which throws at render).",
    },
    schema: [],
    messages: {
      inlineHandler:
        'Inline event handler "{{name}}" is rendered as an HTML attribute. It works, but it requires a `script-src \'unsafe-inline\'` CSP allowance and the code in the string is never bundled or type-checked. Prefer attaching the listener from a script.',
      functionHandler:
        'Event handler "{{name}}" was passed a function. @vincle/core renders to HTML, so there is nothing to attach it to and rendering throws. Pass a string, or attach the listener client-side.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.type !== "JSXIdentifier") return;
        const name: string = node.name.name;
        if (!/^on[A-Za-z]/.test(name)) return;

        const value = node.value;
        const expression = value?.type === "JSXExpressionContainer" ? value.expression : undefined;

        context.report({
          node,
          messageId: isFunctionExpression(expression) ? "functionHandler" : "inlineHandler",
          data: { name },
        });
      },
    };
  },
};
