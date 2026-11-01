import { expect, test } from "bun:test";

import { checkServedKey, pickKeyFile } from "./indexnow";

const KEY = "11111111-2222-3333-4444-555555555555";
const LOCATION = `https://vincle.cjean.fr/${KEY}.txt`;

const stubFetch = (impl: () => Promise<Response>) => impl as unknown as typeof fetch;

test("the key file is self-describing among other .txt files", () => {
  const res = pickKeyFile([
    { name: "robots.txt", content: "User-agent: *\nAllow: /\n" },
    { name: "short.txt", content: "short" },
    { name: `${KEY}.txt`, content: `${KEY}\n` },
  ]);
  expect(res).toEqual({ status: "found", key: KEY });
  expect(pickKeyFile([{ name: "robots.txt", content: "User-agent: *\n" }])).toEqual({
    status: "absent",
  });
  expect(
    pickKeyFile([
      { name: `${KEY}.txt`, content: KEY },
      {
        name: "99999999-0000-0000-0000-000000000000.txt",
        content: "99999999-0000-0000-0000-000000000000",
      },
    ]).status,
  ).toBe("error");
});

test("verified when the served file contains exactly the key", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response(KEY)),
  );
  expect(res).toEqual({ status: "verified" });
});

test("verified when the served file has a trailing newline", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response(`${KEY}\n`)),
  );
  expect(res).toEqual({ status: "verified" });
});

test("404 skips the submission with a warning, without leaking served content", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response("Not Found", { status: 404, statusText: "Not Found" })),
  );
  expect(res.status).toBe("skipped");
  if (res.status === "skipped") {
    expect(res.warning).toContain("HTTP 404");
    expect(res.warning).not.toContain(KEY);
    expect(res.warning).not.toContain(LOCATION);
  }
});

test("other HTTP errors stay errors", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(
      async () => new Response("oops", { status: 500, statusText: "Internal Server Error" }),
    ),
  );
  expect(res.status).toBe("error");
  if (res.status === "error") {
    expect(res.error).toContain("HTTP 500");
  }
});

test("mismatch reports a distinct error without leaking served content", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => new Response("99999999-0000-0000-0000-000000000000")),
  );
  expect(res.status).toBe("error");
  if (res.status === "error") {
    expect(res.error).toContain("does not match");
    expect(res.error).not.toContain("99999999");
  }
});

test("network failure is reported distinctly", async () => {
  const res = await checkServedKey(
    LOCATION,
    KEY,
    stubFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND vincle.cjean.fr");
    }),
  );
  expect(res.status).toBe("error");
  if (res.status === "error") {
    expect(res.error).toContain("fetching it failed");
  }
});
