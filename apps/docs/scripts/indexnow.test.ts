import { expect, test } from "bun:test";
import { checkServedKey } from "./indexnow";

const KEY = "11111111-2222-3333-4444-555555555555";
const LOCATION = `https://vincle.cjean.fr/${KEY}.txt`;

const stubFetch = (impl: () => Promise<Response>) => impl as unknown as typeof fetch;

test("ok when the served file contains exactly the key", async () => {
  const res = await checkServedKey(LOCATION, KEY, stubFetch(async () => new Response(KEY)));
  expect(res).toEqual({ ok: true });
});

test("ok when the served file has a trailing newline", async () => {
  const res = await checkServedKey(LOCATION, KEY, stubFetch(async () => new Response(`${KEY}\n`)));
  expect(res).toEqual({ ok: true });
});

test("mismatch reports a distinct error without leaking the key", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response("99999999-0000-0000-0000-000000000000")),
  );
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error).toContain("does not match");
    expect(res.error).not.toContain(KEY);
    expect(res.error).not.toContain(LOCATION);
  }
});

test("HTTP error is reported with its status, without leaking the key", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response("Not Found", { status: 404, statusText: "Not Found" })),
  );
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error).toContain("HTTP 404");
    expect(res.error).not.toContain(KEY);
    expect(res.error).not.toContain(LOCATION);
  }
});

test("network failure is reported distinctly, without leaking the key", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND vincle.cjean.fr");
    }),
  );
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error).toContain("fetching the key file failed");
    expect(res.error).not.toContain(KEY);
  }
});
