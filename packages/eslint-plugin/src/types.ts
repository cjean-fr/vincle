/**
 * Minimal rule types for the @vincle/eslint-plugin.
 * Compatible with both ESLint and oxlint JS plugin API.
 */

export interface RuleFix {
  range: [number, number];
  text: string;
}

export interface RuleFixer {
  insertTextAfter(nodeOrRange: unknown, text: string): RuleFix;
  insertTextBeforeRange(range: [number, number], text: string): RuleFix;
  replaceText(nodeOrRange: unknown, text: string): RuleFix;
  replaceTextRange(range: [number, number], text: string): RuleFix;
}

export interface RuleContext {
  id: string;
  options: unknown[];
  sourceCode: {
    ast: { body: Array<{ type: string; [key: string]: unknown }> };
    getText(node?: unknown): string;
  };
  report(descriptor: {
    node: unknown;
    messageId?: string;
    data?: Record<string, string>;
    fix?: RuleFix | ((fixer: RuleFixer) => RuleFix | null);
    suggest?: Array<{
      messageId: string;
      data?: Record<string, string>;
      fix: RuleFix | ((fixer: RuleFixer) => RuleFix | null | RuleFix[]);
    }>;
  }): void;
  getFilename(): string;
}

export type Visitor = Record<string, (node: any) => void>;

export interface RuleModule {
  meta?: {
    type: "problem" | "suggestion" | "layout";
    docs?: { description?: string };
    fixable?: "code" | "whitespace";
    hasSuggestions?: boolean;
    schema?: unknown[];
    messages?: Record<string, string>;
  };
  defaultOptions?: unknown[];
  create(context: RuleContext): Visitor;
}
