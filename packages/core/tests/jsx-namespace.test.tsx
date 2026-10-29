/** @jsxImportSource @vincle/core */

import { expect, test } from "bun:test";

import { renderToString, type JSX } from "@vincle/core";

// The contract this file pins is mostly compile-time: `bun check` type-checks
// it, so a regression that narrows `JSX.Element` fails the build here, not in
// a user's editor. `children: JSX.Element` is the annotation anyone arriving
// from React reaches for first; it must accept every renderable shape.

function Layout({ children }: { children: JSX.Element }) {
  return <div>{children}</div>;
}

const shapes: [string, JSX.Element][] = [
  ["a single node", <em>one</em>],
  ["several nodes", [<em>a</em>, <strong>b</strong>]],
  ["text", "plain"],
  ["a number", 42],
  ["nothing", null],
  ["a promise", Promise.resolve("later")],
];

// An object is still not renderable: the union is wide, not `any`.
const rejected = (
  // @ts-expect-error plain objects are not renderable
  <Layout>{{ not: "renderable" }}</Layout>
);
void rejected;

// An async component that writes its return type down, React-style.
async function Annotated(): Promise<JSX.Element> {
  return [<em>a</em>, <strong>b</strong>];
}

test("children typed JSX.Element accept every renderable shape", async () => {
  for (const [name, child] of shapes) {
    expect(await renderToString(<Layout>{child}</Layout>), name).toBeTruthy();
  }
  expect(await renderToString(<Layout>{shapes[1]![1]}</Layout>)).toBe(
    "<div><em>a</em><strong>b</strong></div>",
  );
  expect(await renderToString(<Layout>{shapes[2]![1]}</Layout>)).toBe("<div>plain</div>");
  expect(await renderToString(<Annotated />)).toBe("<em>a</em><strong>b</strong>");
});
