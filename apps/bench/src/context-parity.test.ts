/**
 * React 19 context parity — the executable spec.
 *
 * Each case builds one component tree, parameterised over the runtime, and
 * renders it with both `renderToStaticMarkup` (React) and `renderToString`
 * (vincle). The assertion is a triple: both engines agree, and both agree
 * with the pinned expected string — so a future React upgrade that moves
 * behaviour fails here the same way a vincle regression would.
 *
 * The surface tracked is React 19's modern one: the context object is the
 * provider (`ctx.Provider === ctx`), `ctx.Consumer` is the render-prop reader,
 * and there is no `defaultValue` property. What React deprecated (legacy
 * context, class `contextType`, ...) is deliberately out of scope.
 *
 * The `no-context` rule is overridden for this app: comparing against React's
 * real context is the point of this file.
 */
import type { Renderable } from "@vincle/core";
import type { ReactNode } from "react";

import { Fragment as VincleFragment, renderToString } from "@vincle/core";
import { createContext as vincleCreateContext, useContext as vincleUseContext } from "@vincle/core";
import { jsx } from "@vincle/core/jsx-runtime";
import { describe, expect, it } from "bun:test";
import {
  createElement as reactCreate,
  createContext as reactCreateContext,
  Fragment as ReactFragment,
  useContext as reactUseContext,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Ctx = { Provider: unknown; Consumer: unknown };

interface Runtime {
  create(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  createContext(defaultValue: unknown): Ctx;
  useContext(ctx: Ctx): unknown;
  Fragment: unknown;
}

const reactRT: Runtime = {
  create: (type, props, ...children) =>
    reactCreate(type as never, props as never, ...(children as unknown as ReactNode[])),
  createContext: (d) => reactCreateContext(d),
  useContext: (c) => reactUseContext(c as never),
  Fragment: ReactFragment,
};

const vincleRT: Runtime = {
  create: (type, props, ...children) => {
    const attrs: Record<string, unknown> = { ...props };
    if (children.length === 1) attrs["children"] = children[0];
    else if (children.length > 1) attrs["children"] = children;
    return jsx(type as never, attrs);
  },
  createContext: (d) => vincleCreateContext(d),
  useContext: (c) => vincleUseContext(c as never),
  Fragment: VincleFragment,
};

const read = (value: unknown): string => "v=" + value;
const reader =
  (rt: Runtime, ctx: Ctx, fmt: (v: unknown) => unknown = read) =>
  () =>
    fmt(rt.useContext(ctx));
const consumer = (rt: Runtime, ctx: Ctx, render: (v: unknown) => unknown) =>
  rt.create(ctx.Consumer, { children: render });

const cases: Array<{ name: string; expected: string; build: (rt: Runtime) => unknown }> = [
  {
    name: "without a Provider, useContext reads the declared default",
    expected: "v=def",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(reader(rt, ctx));
    },
  },
  {
    name: "the context itself is the provider (React 19 form)",
    expected: "v=1",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(ctx, { value: 1 }, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: ".Provider is the context, as in React 19",
    expected: "v=2",
    build: (rt) => {
      const ctx = rt.createContext("def");
      expect(ctx.Provider).toBe(ctx);
      return rt.create(ctx.Provider, { value: 2 }, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "the nearest Provider wins",
    expected: "v=b",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(
        ctx,
        { value: "a" },
        rt.create(ctx, { value: "b" }, rt.create(reader(rt, ctx))),
      );
    },
  },
  {
    name: "a Provider covers every one of its children",
    expected: "v=xv=x",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(ctx, { value: "x" }, rt.create(reader(rt, ctx)), rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "siblings outside the Provider keep the default",
    expected: "<div>v=defv=xv=def</div>",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const r = rt.create(reader(rt, ctx));
      return rt.create("div", null, r, rt.create(ctx, { value: "x" }, r), r);
    },
  },
  {
    name: "a reader above a Provider is not shadowed by its descendants",
    expected: "<div>v=defv=x</div>",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(
        "div",
        null,
        rt.create(reader(rt, ctx)),
        rt.create(ctx, { value: "x" }, rt.create(reader(rt, ctx))),
      );
    },
  },
  {
    name: "a Provider returned by a component works",
    expected: "v=7",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const Comp = () => rt.create(ctx, { value: 7 }, rt.create(reader(rt, ctx)));
      return rt.create(Comp);
    },
  },
  {
    name: "two contexts stay separate",
    expected: "v=A1v=B1",
    build: (rt) => {
      const a = rt.createContext("a0");
      const b = rt.createContext("b0");
      return rt.create(
        a,
        { value: "A1" },
        rt.create(b, { value: "B1" }, rt.create(reader(rt, a)), rt.create(reader(rt, b))),
      );
    },
  },
  {
    name: "an explicit null value is null, not the default",
    expected: "v=null",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(ctx, { value: null }, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "an explicit undefined value is undefined, not the default",
    expected: "v=undefined",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(ctx, { value: undefined }, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "a missing value prop is undefined, not the default",
    expected: "v=undefined",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(ctx.Provider, {}, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "a number value renders as its text",
    expected: "v=42",
    build: (rt) => {
      const ctx = rt.createContext(0);
      return rt.create(ctx, { value: 42 }, rt.create(reader(rt, ctx)));
    },
  },
  {
    name: "an object value is read as the provided object",
    expected: "n=2",
    build: (rt) => {
      const ctx = rt.createContext({ n: 1 });
      const R = () => "n=" + (rt.useContext(ctx) as { n: number }).n;
      return rt.create(ctx, { value: { n: 2 } }, rt.create(R));
    },
  },
  {
    name: "a deep tree keeps the value",
    expected: "<div><div><div><div>v=x</div></div></div></div>",
    build: (rt) => {
      const ctx = rt.createContext("def");
      let node: unknown = rt.create(reader(rt, ctx));
      for (let i = 0; i < 4; i++) node = rt.create("div", null, node);
      return rt.create(ctx, { value: "x" }, node);
    },
  },
  {
    name: "Consumer reads the nearest Provider",
    expected: "v=b",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return rt.create(
        ctx,
        { value: "a" },
        rt.create(ctx, { value: "b" }, consumer(rt, ctx, read)),
      );
    },
  },
  {
    name: "Consumer falls back to the default",
    expected: "v=def",
    build: (rt) => {
      const ctx = rt.createContext("def");
      return consumer(rt, ctx, read);
    },
  },
  {
    name: "Consumer renders whatever its function returns",
    expected: "v=en",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const R = reader(rt, ctx);
      return rt.create(
        ctx,
        { value: "en" },
        consumer(rt, ctx, () => rt.create(R)),
      );
    },
  },
  {
    name: "a Consumer returned by a component works",
    expected: "v=en",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const Comp = () => consumer(rt, ctx, read);
      return rt.create(ctx, { value: "en" }, rt.create(Comp));
    },
  },
  {
    name: "a Fragment under a Provider keeps the value",
    expected: "v=xv=x",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const r = () => rt.create(reader(rt, ctx));
      return rt.create(ctx, { value: "x" }, rt.create(rt.Fragment, null, r(), r()));
    },
  },
  {
    name: "nested providers of different contexts compose",
    expected: "v=a1v=b1",
    build: (rt) => {
      const a = rt.createContext("a0");
      const b = rt.createContext("b0");
      return rt.create(
        a,
        { value: "a1" },
        rt.create(b, { value: "b1" }, rt.create(reader(rt, a)), rt.create(reader(rt, b))),
      );
    },
  },
  {
    name: "a Consumer sibling to a Provider reads the default",
    expected: "<div>v=xv=def</div>",
    build: (rt) => {
      const ctx = rt.createContext("def");
      const c = () => consumer(rt, ctx, read);
      return rt.create("div", null, rt.create(ctx, { value: "x" }, c()), c());
    },
  },
];

async function renderBoth(build: (rt: Runtime) => unknown): Promise<{
  react: string;
  vincle: string;
}> {
  const react = renderToStaticMarkup(build(reactRT) as ReactNode);
  const vincle = await renderToString(build(vincleRT) as Renderable);
  return { react, vincle };
}

describe("context parity with React 19", () => {
  for (const { name, expected, build } of cases) {
    it(name, async () => {
      const { react, vincle } = await renderBoth(build);
      expect(react).toBe(expected);
      expect(vincle).toBe(expected);
    });
  }

  it("the context object exposes the React 19 surface and nothing else", () => {
    const ctx = vincleCreateContext("def");
    expect(Object.keys(ctx)).toEqual(["Provider", "Consumer"]);
    expect(ctx.Provider).toBe(ctx);
    expect(typeof ctx.Consumer).toBe("function");
  });
});
