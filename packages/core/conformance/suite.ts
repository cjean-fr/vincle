import { ExecutionContext } from "@vincle/core";
/**
 * Multi-runtime conformance — what `bun test` can't cover.
 *
 * The unit suite runs on Bun, against the sources. This one runs on **every
 * claimed runtime**, against the **published artifact**: the `exports` map
 * reserves the `bun` condition (TS sources) for Bun, everything else lands on
 * `dist/*.mjs`. Two blind spots closed at once — the port, and the gap
 * between what's tested and what's published.
 *
 * What's checked here is what **depends on the runtime**, not the whole API:
 * `SyncContextStore` exists because `AsyncLocalStorage` can be missing, and
 * that's exactly what Bun alone can't tell apart.
 *
 * No dependencies, no test framework, no JSX syntax: the module has to load
 * as-is under Bun, Node, Deno and workerd — only the first has `bun:test`,
 * only the first three have a `process`, and each transpiles JSX its own way.
 *
 * It runs nothing on import: workerd forbids async work at module load time.
 * The entry points are `run.ts` (CLI) and `worker.ts`.
 */
import { createContext, raw, renderToString, useContext } from "@vincle/core";
import { jsxEscape, jsxTemplate } from "@vincle/core/jsx-precompile-runtime";
import { jsx } from "@vincle/core/jsx-runtime";

export interface Failure {
  name: string;
  detail: string;
}

export interface ConformanceResult {
  runtime: string;
  passed: number;
  total: number;
  failures: Failure[];
}

/**
 * The runtime's name, so the report says what it ran on.
 *
 * workerd is checked **before** Node, and that's not a style detail: under
 * `nodejs_compat`, workerd polyfills `process.versions.node` and would report
 * itself as "node 22". A conformance report that gets the runtime wrong
 * proves nothing. `navigator.userAgent` is the exact marker Cloudflare
 * documents.
 */
export function runtimeName(): string {
  const g = globalThis as Record<string, any>;
  if (g["navigator"]?.userAgent === "Cloudflare-Workers") return "workerd";
  if (g["Bun"]?.version) return `bun ${g["Bun"].version}`;
  if (g["Deno"]?.version?.deno) return `deno ${g["Deno"].version.deno}`;
  if (g["process"]?.versions?.node) return `node ${g["process"].versions.node}`;
  return "unknown runtime";
}

export async function runConformance(): Promise<ConformanceResult> {
  const failures: Failure[] = [];
  let passed = 0;

  const check = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
      passed++;
    } catch (error) {
      failures.push({ name, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const eq = (actual: unknown, expected: unknown, what: string): void => {
    if (actual !== expected) {
      throw new Error(
        `${what} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. The artifact loads and renders
  // ───────────────────────────────────────────────────────────────────────────

  await check("renders a simple element", async () => {
    eq(await renderToString(jsx("p", { children: "hello" })), "<p>hello</p>", "render");
  });

  await check("escapes text", async () => {
    eq(
      await renderToString(jsx("p", { children: "a & b < c > d" })),
      "<p>a &amp; b &lt; c &gt; d</p>",
      "text escaping",
    );
  });

  await check("escapes attributes", async () => {
    eq(
      await renderToString(jsx("p", { title: 'a"b', children: "x" })),
      '<p title="a&quot;b">x</p>',
      "attribute escaping",
    );
  });

  await check("raw() passes through unescaped", async () => {
    eq(await renderToString(jsx("p", { children: raw("<b>x</b>") })), "<p><b>x</b></p>", "raw");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Context across `await` — the runtime-dependent core of this suite
  // ───────────────────────────────────────────────────────────────────────────

  const Theme = ExecutionContext.key<string>("conformance:theme");

  await check("execution context survives an await", async () => {
    const seen = await ExecutionContext.withScope(async () => {
      ExecutionContext.set(Theme, "dark");
      await Promise.resolve();
      return ExecutionContext.get(Theme);
    });
    eq(seen, "dark", "value after await");
  });

  await check("execution context survives several microtask hops", async () => {
    const seen = await ExecutionContext.withScope(async () => {
      ExecutionContext.set(Theme, "sepia");
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return ExecutionContext.get(Theme);
    });
    eq(seen, "sepia", "value after 5 awaits");
  });

  // The test that justifies this file. Two scopes in flight at once: exactly
  // what a synchronous stack can't tell apart, and what a runtime with no
  // `AsyncLocalStorage` must refuse rather than render incorrectly. Success
  // therefore has two valid shapes — correct isolation, or an explicit
  // refusal; only one thing counts as a failure: rendering another scope's
  // value.
  await check("two concurrent scopes don't leak into each other", async () => {
    const scope = (value: string, delay: number) =>
      ExecutionContext.withScope(async () => {
        ExecutionContext.set(Theme, value);
        await new Promise((r) => setTimeout(r, delay));
        return ExecutionContext.get(Theme);
      });

    let results: string[];
    try {
      results = await Promise.all([scope("one", 20), scope("two", 0)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("no AsyncLocalStorage")) return; // explicit refusal: correct
      throw error;
    }
    eq(results[0], "one", "scope A");
    eq(results[1], "two", "scope B");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Async components
  // ───────────────────────────────────────────────────────────────────────────

  await check("renders an async component", async () => {
    const Slow = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return jsx("em", { children: "late" });
    };
    eq(await renderToString(jsx(Slow, {})), "<em>late</em>", "async component");
  });

  await check("an async component reads its scope's execution context", async () => {
    const Reader = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return jsx("span", { children: ExecutionContext.get(Theme) });
    };
    const html = await ExecutionContext.withScope(async () => {
      ExecutionContext.set(Theme, "inherited");
      return renderToString(jsx(Reader, {}));
    });
    eq(html, "<span>inherited</span>", "execution context in an async component");
  });

  await check("tree Provider survives await and restores the default", async () => {
    const Locale = createContext("default");
    const Reader = async () => {
      await Promise.resolve();
      return jsx("b", { children: useContext(Locale) });
    };
    const html = await renderToString(
      jsx("main", {
        children: [
          jsx(Reader, {}),
          jsx(Locale.Provider, { value: "nested", children: jsx(Reader, {}) }),
          jsx(Reader, {}),
        ],
      }),
    );
    eq(html, "<main><b>default</b><b>nested</b><b>default</b></main>", "Provider ancestry");
  });

  await check("Deno precompile helpers keep Provider ancestry", async () => {
    const Locale = createContext("default");
    const Reader = () => jsx("b", { children: useContext(Locale) });
    const html = await renderToString(
      jsx(Locale.Provider, {
        value: "nested",
        children: jsxTemplate`<main>${jsxEscape([jsx(Reader, {}), jsx(Reader, {})])}</main>`,
      }),
    );
    eq(html, "<main><b>nested</b><b>nested</b></main>", "Provider in Deno template");
  });

  return { runtime: runtimeName(), passed, total: passed + failures.length, failures };
}

/** Report shared by both entry points, so the output is the same everywhere. */
export function report(result: ConformanceResult): string {
  const lines = [`[conformance] ${result.runtime} — ${result.passed}/${result.total}`];
  for (const f of result.failures) lines.push(`  ✗ ${f.name}\n      ${f.detail}`);
  return lines.join("\n");
}
