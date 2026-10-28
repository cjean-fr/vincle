import type { RuleModule } from "../types.js";

/**
 * A convention rule, not a bug detector. On an HTML tag, children and
 * `dangerouslySetInnerHTML` are two sources of content, and the runtime
 * refuses the conflict at construction (`ERR_VINCLE_DANGEROUS_HTML_CHILDREN`).
 * On a component both are ordinary props the runtime passes through untouched:
 * which one the component uses is its own contract, and nothing at the call
 * site shows it. The rule makes that ambiguity an error, so the contract is
 * stated at the call site or the exception is made explicit.
 *
 * Only an attribute literally named `dangerouslySetInnerHTML` is seen: a
 * spread may carry one, but then the call site cannot be judged.
 */

function isComponentTag(name: any): boolean {
  // <Foo.Bar /> names a component through a member; <Foo> through a capital.
  if (name?.type === "JSXMemberExpression") return true;
  if (name?.type !== "JSXIdentifier") return false;
  const first: string | undefined = name.name[0];
  return first !== undefined && first >= "A" && first <= "Z";
}

function attrName(node: any): string {
  if (node.name?.type === "JSXNamespacedName") {
    return `${node.name.namespace.name}:${node.name.name.name}`;
  }
  return node.name?.name ?? "";
}

function hasDsihAttribute(opening: any): boolean {
  return (opening?.attributes ?? []).some(
    (attr: any) => attr?.type === "JSXAttribute" && attrName(attr) === "dangerouslySetInnerHTML",
  );
}

function hasContent(children: any[]): boolean {
  return (children ?? []).some((child: any) => {
    if (child?.type === "JSXText" || child?.type === "Literal") {
      return typeof child.value === "string" ? child.value.trim() !== "" : true;
    }
    if (child?.type === "JSXExpressionContainer") {
      // `{/* comment */}` is an empty expression: no content.
      return child.expression?.type !== "JSXEmptyExpression";
    }
    return true;
  });
}

export const noDangerouslySetInnerHtmlChildren: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow children on a component that also receives dangerouslySetInnerHTML.",
    },
    schema: [],
    messages: {
      noDsihChildren:
        "This component receives both dangerouslySetInnerHTML and children: keep one source of content, so the call site shows which one is used.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXElement(node: any) {
        const opening = node.openingElement;
        if (!isComponentTag(opening?.name)) return;
        if (!hasDsihAttribute(opening)) return;
        if (!hasContent(node.children)) return;
        context.report({ node: opening, messageId: "noDsihChildren" });
      },
    };
  },
};
