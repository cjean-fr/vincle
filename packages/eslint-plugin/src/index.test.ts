import plugin from "./index.js";
import { describe, it, expect } from "bun:test";

const rules = plugin.rules!;
const configs = plugin.configs!;
const recommended = configs["recommended"]!;

describe("plugin index", () => {
  it("default exports the plugin object", () => {
    expect(plugin).toBeDefined();
    expect(typeof plugin).toBe("object");
  });

  it("has all 7 rules", () => {
    const ruleNames = Object.keys(rules).sort();
    expect(ruleNames).toEqual([
      "no-context",
      "no-global-jsx-namespace",
      "no-javascript-urls",
      "no-react-hooks",
      "no-react-imports",
      "no-refs",
      "no-unsafe-event-handlers",
    ]);
  });

  it("each rule has meta, no schema, and at least one message", () => {
    for (const [, rule] of Object.entries(rules) as Array<
      [
        string,
        {
          meta?: {
            type?: string;
            schema?: Array<unknown>;
            messages?: Record<string, string>;
          };
        },
      ]
    >) {
      expect(rule.meta).toBeDefined();
      expect(rule.meta!.schema).toEqual([]);
      expect(rule.meta!.messages).toBeDefined();
      expect(Object.keys(rule.meta!.messages!).length).toBeGreaterThanOrEqual(
        1,
      );
    }
  });

  it("has recommended config", () => {
    expect(configs).toBeDefined();
    expect(recommended).toBeDefined();
  });

  it("recommended config has all 7 rules with correct severities", () => {
    expect(recommended.rules).toEqual({
      "@vincle/core/no-react-imports": "error",
      "@vincle/core/no-react-hooks": "error",
      "@vincle/core/no-unsafe-event-handlers": "warn",
      "@vincle/core/no-javascript-urls": "error",
      "@vincle/core/no-context": "error",
      "@vincle/core/no-refs": "error",
      "@vincle/core/no-global-jsx-namespace": "error",
    });
  });

  it("every rule in recommended config exists in rules map", () => {
    const prefix = "@vincle/core/";
    const ruleKeys = Object.keys(rules);
    for (const key of Object.keys(recommended.rules!)) {
      const ruleName = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      expect(ruleKeys).toContain(ruleName);
    }
  });

  it("recommended config references the plugin object itself", () => {
    expect(recommended.plugins!["@vincle/core"]).toBe(plugin);
  });
});
