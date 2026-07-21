/**
 * Bench: @vincle/flow Template pipeline via API publique.
 *
 * Suites :
 *  - renderToStream avec Template sync (registration pure, pas de placeholder)
 *  - renderToStream avec Template async (Promise children → placeholder + flush)
 *  - renderToStream avec Template + async generator (stream)
 *  - Concurrence : N Templates async en parallèle
 */
import { type VNode, type ResolvedVNode } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";
import { renderToStream, Template } from "@vincle/flow";
import { TurboAdapter } from "@vincle/flow/adapters";

import { bench, group, run } from "mitata";

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks.join("");
}

// --- 1. Sync Template — registration pure (pas de placeholder) ---

function syncPage(n: number) {
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(jsx(Template, {
      target: `t${i}`,
      children: jsx("span", { children: `item-${i}` }),
    }));
  }
  return jsx("html", { children: [jsx("body", { children: items })] });
}

group("Template — sync children (no placeholder)", () => {
  bench("10 templates", async () => {
    await collect(renderToStream(() => syncPage(10), TurboAdapter));
  });
  bench("100 templates", async () => {
    await collect(renderToStream(() => syncPage(100), TurboAdapter));
  });
});

// --- 2. Async Template — Promise children ---

function asyncPage(n: number) {
  const AsyncComp = async ({ i }: { i: number }) => {
    await Promise.resolve();
    return jsx("span", { children: `item-${i}` });
  };
  const items: VNode[] = [];
  for (let i = 0; i < n; i++) {
    items.push(jsx(Template, {
      target: `t${i}`,
      fallback: jsx("div", { children: "..." }),
      children: jsx(AsyncComp, { i }),
    }));
  }
  return jsx("html", { children: [jsx("body", { children: items })] });
}

group("Template — async children (Promise, placeholder + flush)", () => {
  bench("10 templates", async () => {
    await collect(renderToStream(() => asyncPage(10), TurboAdapter));
  });
  bench("50 templates", async () => {
    await collect(renderToStream(() => asyncPage(50), TurboAdapter));
  });
});

// --- 3. Lazy factory (injection wrapper) ---

group("Template — lazy factory", () => {
  bench("10 templates", async () => {
    function makeItems() {
      const items: VNode[] = [];
      for (let i = 0; i < 10; i++) {
        const value = `item-${i}`;
        items.push(jsx(Template, {
          target: `t${i}`,
          children: () => jsx("span", { children: value }),
        }));
      }
      return jsx("html", { children: [jsx("body", { children: items })] });
    }
    await collect(renderToStream(() => makeItems(), TurboAdapter));
  });
});

// --- 4. Stream (async generator) ---

group("Template — stream (async generator)", () => {
  bench("3 yields", async () => {
    async function* items() {
      yield jsx("li", { children: "a" }) as ResolvedVNode;
      yield jsx("li", { children: "b" }) as ResolvedVNode;
      yield jsx("li", { children: "c" }) as ResolvedVNode;
    }
    await collect(
      renderToStream(
        () => jsx("html", {
          children: jsx("body", {
            children: jsx(Template, {
              target: "feed",
              merge: "append",
              children: items(),
            }),
          }),
        }),
        TurboAdapter,
      ),
    );
  });
});

run();
