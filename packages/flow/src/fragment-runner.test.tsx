import { describe, expect, it } from "bun:test";

import type { FlowEvent } from "./types.js";

import { runFragment } from "./fragment-runner.js";

const bounded = async (done: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      done,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("fragment did not settle")), 500);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
};

describe("fragment lifecycle", () => {
  for (const kind of ["value", "sync-error", "stream", "stream-chunk"] as const) {
    it(`bounds a pending error fallback for ${kind} content`, async () => {
      const failure = new Error("content failed");
      let reported: unknown;
      let reports = 0;
      const events: FlowEvent[] = [];
      async function* chunks() {
        if (kind === "stream") throw failure;
        yield Promise.reject(failure);
      }
      const content =
        kind === "value"
          ? new Promise<never>(() => {})
          : kind === "sync-error"
            ? () => {
                throw failure;
              }
            : chunks();
      const { done } = runFragment(
        "blocked",
        { content, merge: "replace", timeout: 5 },
        async (event) => {
          events.push(event);
        },
        {
          onError: (error) => {
            reports++;
            reported = error;
            return new Promise<never>(() => {});
          },
        },
      );
      const rejection = await bounded(done).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(rejection).toBe(reported);
      expect(reports).toBe(1);
      if (kind === "value") expect((reported as Error).message).toContain("timed out");
      else expect(reported).toBe(failure);
      expect(events).toEqual([]);
    });
  }

  it("uses the default timeout for an error fallback", async () => {
    const failure = new Error("content failed");
    const { done } = runFragment(
      "blocked",
      {
        content: () => {
          throw failure;
        },
        merge: "replace",
      },
      async () => {},
      { defaultTimeout: 5, onError: () => new Promise<never>(() => {}) },
    );
    await expect(bounded(done)).rejects.toBe(failure);
  });

  it("cancels a pending error fallback even without a timeout", async () => {
    const started = Promise.withResolvers<void>();
    const request = new AbortController();
    const events: FlowEvent[] = [];
    const failure = new Error("content failed");
    const { done } = runFragment(
      "blocked",
      {
        content: () => {
          throw failure;
        },
        merge: "replace",
      },
      async (event) => {
        events.push(event);
      },
      {
        signal: request.signal,
        onError: () => {
          started.resolve();
          return new Promise<never>(() => {});
        },
      },
    );
    await started.promise;
    request.abort();
    await expect(bounded(done)).rejects.toBe(failure);
    expect(events).toEqual([]);
  });

  it("times out content that never settles and emits the error fallback", async () => {
    const events: FlowEvent[] = [];
    let error: unknown;
    const { done } = runFragment(
      "blocked",
      { content: new Promise<never>(() => {}), merge: "replace", timeout: 5 },
      async (event) => {
        events.push(event);
      },
      {
        onError: (reason) => {
          error = reason;
          return <span>fallback</span>;
        },
      },
    );
    await bounded(done);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("timed out");
    expect(events).toEqual([
      { type: "fragment", id: "blocked", html: "<span>fallback</span>", merge: "replace" },
    ]);
  });

  it("closes a generator when emitting fails, keeping the original error", async () => {
    let closed = false;
    async function* chunks() {
      try {
        yield "chunk";
      } finally {
        closed = true;
      }
    }
    const error = new Error("broken channel");
    const { done } = runFragment(
      "feed",
      { content: chunks(), merge: "append" },
      async () => {
        throw error;
      },
      {},
    );
    await expect(done).rejects.toBe(error);
    expect(closed).toBe(true);
  });

  it("does not wait for a generator's queued return when next never settles", async () => {
    async function* chunks() {
      await new Promise<never>(() => {});
      yield "unreachable";
    }
    let error: unknown;
    const { done } = runFragment(
      "feed",
      { content: chunks(), merge: "append", timeout: 5 },
      async () => {},
      {
        onError: (reason) => {
          error = reason;
          return;
        },
      },
    );
    await bounded(done);
    expect((error as Error).message).toContain("timed out");
  });

  it("times out a stream chunk whose rendering never settles", async () => {
    function Pending() {
      return new Promise<never>(() => {});
    }
    async function* chunks() {
      yield <Pending />;
    }
    let errors = 0;
    const { done } = runFragment(
      "feed",
      { content: chunks(), merge: "append", timeout: 5 },
      async () => {},
      {
        onError: () => {
          errors++;
          return;
        },
      },
    );
    await bounded(done);
    expect(errors).toBe(1);
  });
});
