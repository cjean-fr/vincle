import { describe, expect, it } from "bun:test";

import { createTimeoutSignal } from "./timeout.js";

/**
 * Deliberately wide margin between the armed delay and the wait: the suite
 * also runs under Stryker, at concurrency 2, where a contended core skews
 * timers. A test chasing the millisecond would fail there with no mutant to
 * blame.
 */
const ARM_MS = 10;
const OBSERVE_MS = 80;

describe("createTimeoutSignal", () => {
  describe("without a timeout", () => {
    it("hands back the request signal itself, so the caller keeps one identity", () => {
      const request = new AbortController();
      const { signal } = createTimeoutSignal(undefined, request.signal, "t");

      expect(signal).toBe(request.signal);
    });

    it("still aborts with the request, since it is that very signal", () => {
      const request = new AbortController();
      const { signal } = createTimeoutSignal(undefined, request.signal, "t");
      const reason = new Error("request gone");

      request.abort(reason);

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(reason);
    });

    it("substitutes a signal that never aborts when there is no request either", async () => {
      const { signal } = createTimeoutSignal(undefined, undefined, "t");

      expect(signal.aborted).toBe(false);
      await Bun.sleep(OBSERVE_MS);
      expect(signal.aborted).toBe(false);
    });

    it("returns a cleanup that is safe to call, and to call twice", () => {
      const { cleanup } = createTimeoutSignal(undefined, undefined, "t");

      expect(() => {
        cleanup();
        cleanup();
      }).not.toThrow();
    });
  });

  describe("with a timeout", () => {
    it("does not abort before the delay elapses", () => {
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, undefined, "t");

      expect(signal.aborted).toBe(false);
      cleanup();
    });

    it("aborts once the delay elapses, naming the entry and the delay", async () => {
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, undefined, "hero");

      await Bun.sleep(OBSERVE_MS);

      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error).message).toBe(`Template "hero" timed out after ${ARM_MS}ms`);
      cleanup();
    });

    it("combines with the request signal instead of replacing it", async () => {
      const request = new AbortController();
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, request.signal, "t");

      expect(signal).not.toBe(request.signal);

      await Bun.sleep(OBSERVE_MS);

      expect(signal.aborted).toBe(true);
      expect(request.signal.aborted).toBe(false);
      cleanup();
    });

    it("aborts on the request when the request comes first, keeping its reason", () => {
      const request = new AbortController();
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, request.signal, "t");
      const reason = new Error("client disconnected");

      request.abort(reason);

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(reason);
      cleanup();
    });

    it("disarms the timer on cleanup, so a finished entry never aborts", async () => {
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, undefined, "t");

      cleanup();
      await Bun.sleep(OBSERVE_MS);

      expect(signal.aborted).toBe(false);
    });

    it("disarms the combined timer too, leaving the request free to abort later", async () => {
      const request = new AbortController();
      const { signal, cleanup } = createTimeoutSignal(ARM_MS, request.signal, "t");

      cleanup();
      await Bun.sleep(OBSERVE_MS);
      expect(signal.aborted).toBe(false);

      const reason = new Error("late");
      request.abort(reason);
      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(reason);
    });

    it("treats 0 as a real delay rather than an absent one", async () => {
      const { signal, cleanup } = createTimeoutSignal(0, undefined, "zero");

      await Bun.sleep(OBSERVE_MS);

      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error).message).toBe('Template "zero" timed out after 0ms');
      cleanup();
    });
  });
});
