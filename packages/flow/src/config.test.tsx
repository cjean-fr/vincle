import { withScope } from "@vincle/core";
import { describe, expect, it } from "bun:test";

import type { FlowConfig } from "./types.js";

import { TurboAdapter } from "./adapters/index.js";
import { createAdapter } from "./adapters/shared.js";
import {
  assertAdapter,
  assertFlowConfig,
  assertFlowOptions,
  assertTimeout,
  describeValue,
} from "./config.js";
import { initFlow } from "./context.js";
import { renderFragment } from "./fragment.js";
import { renderToFlowEvents, renderToStream } from "./render.js";
import { renderToStatic } from "./static.js";
import { createTemplateStore } from "./template-store.js";

describe("describeValue", () => {
  it("renders values unambiguously in messages", () => {
    expect(describeValue(null)).toBe("null");
    expect(describeValue("x")).toBe('"x"');
    expect(describeValue("")).toBe('""');
    expect(describeValue(42)).toBe("42");
    expect(describeValue(NaN)).toBe("NaN");
    expect(describeValue(true)).toBe("true");
    expect(describeValue(undefined)).toBe("undefined");
    expect(describeValue(() => 1)).toBe("function <anonymous>");
    expect(describeValue(new Error("boom"))).toBe("Error: boom");
    expect(describeValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe("assertFlowOptions", () => {
  it("accepts undefined and well-formed options", () => {
    const controller = new AbortController();
    expect(() => assertFlowOptions(undefined, "test")).not.toThrow();
    expect(() =>
      assertFlowOptions(
        { defaultTimeout: 5000, onError: () => undefined, signal: controller.signal },
        "test",
      ),
    ).not.toThrow();
  });

  it("rejects a negative defaultTimeout", () => {
    expect(() => assertFlowOptions({ defaultTimeout: -1 }, "test")).toThrow(
      "[vincle/flow] test: defaultTimeout must be a number of milliseconds >= 0, got -1",
    );
  });

  it("rejects NaN, Infinity and strings as defaultTimeout", () => {
    expect(() => assertFlowOptions({ defaultTimeout: Number.NaN }, "test")).toThrow(
      "defaultTimeout must be a number of milliseconds >= 0, got NaN",
    );
    expect(() => assertFlowOptions({ defaultTimeout: "5000" } as never, "test")).toThrow(
      'defaultTimeout must be a number of milliseconds >= 0, got "5000"',
    );
  });

  it("rejects a non-function onError", () => {
    expect(() => assertFlowOptions({ onError: "nope" } as never, "test")).toThrow(
      '[vincle/flow] test: onError must be a function (error, { id, kind }) => JSX.Element | void, got "nope"',
    );
  });

  it("rejects a non-AbortSignal signal", () => {
    expect(() => assertFlowOptions({ signal: { aborted: false } } as never, "test")).toThrow(
      "[vincle/flow] test: signal must be an AbortSignal",
    );
  });

  it("ignores foreign keys (e.g. ResponseInit on serve)", () => {
    expect(() =>
      assertFlowOptions({ status: 404, headers: { a: "b" } } as never, "test"),
    ).not.toThrow();
  });
});

describe("assertAdapter", () => {
  it("accepts undefined (static mode) and a built-in adapter", () => {
    expect(() => assertAdapter(undefined, "test")).not.toThrow();
    expect(() => assertAdapter(TurboAdapter, "test")).not.toThrow();
  });

  it("names every missing slot", () => {
    expect(() => assertAdapter({ Placeholder: () => null }, "test")).toThrow(
      '[vincle/flow] test: the adapter is missing "Patch", "Frame"',
    );
  });

  it("rejects a bad capabilities declaration", () => {
    const base = { Placeholder: () => null, Patch: () => null, Frame: () => null };
    expect(() => assertAdapter({ ...base }, "test")).toThrow(
      "[vincle/flow] test: the adapter is missing capabilities",
    );
    expect(() => assertAdapter({ ...base, capabilities: { merges: ["replace"] } }, "test")).toThrow(
      "[vincle/flow] test: adapter.capabilities.streaming must be a boolean",
    );
    expect(() =>
      assertAdapter(
        { ...base, capabilities: { streaming: true, merges: ["replace", "warp"] } },
        "test",
      ),
    ).toThrow("adapter.capabilities.merges must be an array of merge types");
  });
});

describe("assertFlowConfig", () => {
  it("accepts the two valid modes", () => {
    expect(() => assertFlowConfig({ adapter: TurboAdapter, mode: "streaming" })).not.toThrow();
    expect(() =>
      assertFlowConfig({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id: string) => `/f/${id}.html`,
      }),
    ).not.toThrow();
  });

  it("rejects an unknown mode", () => {
    expect(() =>
      assertFlowConfig({ mode: "hybrid", generatePath: () => "/x" } as unknown as FlowConfig),
    ).toThrow('[vincle/flow] FlowConfig.mode must be "streaming" or "static", got "hybrid"');
  });

  it("rejects static mode without generatePath", () => {
    expect(() => assertFlowConfig({ mode: "static" } as FlowConfig)).toThrow(
      "[vincle/flow] FlowConfig: static mode requires generatePath",
    );
  });

  it("rejects generatePath on a streaming config", () => {
    expect(() =>
      assertFlowConfig({
        adapter: TurboAdapter,
        mode: "streaming",
        generatePath: (id: string) => `/f/${id}`,
      } as unknown as FlowConfig),
    ).toThrow("[vincle/flow] FlowConfig: generatePath is only used in static mode");
  });

  it("rejects a non-string idPrefix", () => {
    expect(() =>
      assertFlowConfig({
        adapter: TurboAdapter,
        mode: "streaming",
        idPrefix: 7,
      } as unknown as FlowConfig),
    ).toThrow("[vincle/flow] FlowConfig.idPrefix must be a string, got 7");
  });

  it("rejects a non-function generatePath", () => {
    expect(() =>
      assertFlowConfig({
        mode: "static",
        generatePath: "/fragments" as never,
      }),
    ).toThrow("[vincle/flow] FlowConfig.generatePath must be a function (id) => string");
  });

  it("rejects a malformed adapter", () => {
    expect(() =>
      assertFlowConfig({ adapter: { Placeholder: () => null } as never, mode: "streaming" }),
    ).toThrow('[vincle/flow] FlowConfig: the adapter is missing "Patch", "Frame"');
  });
});

describe("assertTimeout", () => {
  it("accepts undefined and positive values, rejects negatives", () => {
    expect(() => assertTimeout(undefined, "test")).not.toThrow();
    expect(() => assertTimeout(0, "test")).not.toThrow();
    expect(() => assertTimeout(-5, "test")).toThrow(
      "[vincle/flow] test: timeout must be a number of milliseconds >= 0, got -5",
    );
  });
});

describe("createAdapter", () => {
  it("validates the spec at definition time", () => {
    expect(() =>
      createAdapter({
        Placeholder: () => <div />,
        Patch: () => <div />,
        Frame: () => <div />,
        capabilities: { streaming: false, merges: ["replace", "warp"] } as never,
      }),
    ).toThrow(/createAdapter: adapter\.capabilities\.merges must be an array of merge types/);
  });

  it("still builds valid adapters", () => {
    const a = createAdapter({
      Placeholder: () => <div />,
      Patch: () => <div />,
      Frame: () => <div />,
      capabilities: { streaming: false, merges: ["replace"] },
    });
    expect(a.capabilities.merges).toEqual(["replace"]);
  });
});

describe("entry-point fail-fast", () => {
  it("renderToStream rejects bad options before rendering", () => {
    expect(() => renderToStream(() => <div />, TurboAdapter, { defaultTimeout: -1 })).toThrow(
      "[vincle/flow] renderToStream: defaultTimeout must be a number of milliseconds >= 0, got -1",
    );
  });

  it("renderToFlowEvents rejects an incomplete adapter before rendering", () => {
    const broken = { ...TurboAdapter, Patch: undefined };
    expect(() => renderToFlowEvents(() => <div />, broken as never)).toThrow(
      '[vincle/flow] renderToFlowEvents: the adapter is missing "Patch"',
    );
  });

  it("renderToStatic rejects a non-function generatePath before rendering", async () => {
    await expect(
      renderToStatic(async () => "ok", {
        adapter: TurboAdapter,
        generatePath: "/fragments" as never,
      }),
    ).rejects.toThrow(
      '[vincle/flow] renderToStatic: generatePath must be a function (id) => string, got "/fragments"',
    );
  });

  it("renderToStatic rejects a malformed adapter before rendering", async () => {
    await expect(
      renderToStatic(async () => "ok", { adapter: { Frame: () => null } as never }),
    ).rejects.toThrow(
      '[vincle/flow] renderToStatic: the adapter is missing "Placeholder", "Patch"',
    );
  });

  it("renderFragment rejects a missing adapter before rendering", async () => {
    await expect(renderFragment("x", "<i>x</i>", {} as never)).rejects.toThrow(
      "[vincle/flow] renderFragment: opts.adapter is required",
    );
  });

  it("renderFragment rejects a non-function onError before rendering", async () => {
    await expect(
      renderFragment("x", "<i>x</i>", { adapter: TurboAdapter, onError: "nope" } as never),
    ).rejects.toThrow(
      '[vincle/flow] renderFragment: onError must be a function (error, { id, kind }) => JSX.Element | void, got "nope"',
    );
  });

  it("initFlow rejects a bad config at setup, inside a scope", async () => {
    await withScope(async () => {
      expect(() =>
        initFlow({
          adapter: TurboAdapter,
          mode: "streaming",
          idPrefix: 1,
        } as unknown as FlowConfig),
      ).toThrow("[vincle/flow] FlowConfig.idPrefix must be a string, got 1");
    });
  });

  it("register rejects a negative per-fragment timeout", () => {
    const store = createTemplateStore({ adapter: TurboAdapter, mode: "streaming" });
    expect(() =>
      store.register("frag", { content: "<p>x</p>", merge: "replace", timeout: -5 }),
    ).toThrow(
      '[vincle/flow] <Template target="frag">: timeout must be a number of milliseconds >= 0, got -5',
    );
  });
});
