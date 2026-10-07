import { renderToString } from "@vincle/core";
import { describe, expect, it } from "bun:test";

import { CspService, Script, withHash } from "./csp.js";

async function expectedHash(body: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}

describe("CspService", () => {
  it("uses the documentation policy when no policy is supplied", () => {
    const csp = new CspService();
    expect(csp.getCSPHeader()).toContain("default-src 'self'");
    expect(csp.getCSPHeader()).toContain("img-src 'self' data:");
    expect(csp.getCSPHeader()).not.toContain("fontshare.com");
    expect(csp.getCSPHeader()).not.toContain("googleapis.com");
    expect(csp.getCSPHeader()).not.toContain("gstatic.com");
    expect(new CspService({ "script-src": ["'none'"] }).getCSPHeader()).toBe("script-src 'none'");
  });

  it("collects browser-normalized bodies, deduplicates, and clears without losing policy", async () => {
    const csp = new CspService({ "default-src": ["'none'"], "script-src": ["'self'"] });
    const hash = await csp.addScript("é\r\n\0");
    expect(hash).toBe(await expectedHash("é\n\uFFFD"));
    await csp.addScript("é\n\uFFFD");
    expect(csp.getCSPHeader()).toBe(`default-src 'none'; script-src 'self' '${hash}'`);
    expect(csp.getCSPHeader()).toContain(hash);
    csp.clear();
    expect(csp.getCSPHeader()).toBe("default-src 'none'; script-src 'self'");
  });

  it("honors script-src-elem precedence and default-src fallback", async () => {
    const csp = new CspService({ "script-src": ["'none'"], "script-src-elem": ["'self'"] });
    const hash = await csp.addScript("go()");
    expect(csp.getCSPHeader()).toBe(`script-src 'none'; script-src-elem 'self' '${hash}'`);
    const fallback = new CspService({ "default-src": ["'self'"] });
    await fallback.addScript("go()");
    expect(fallback.getCSPHeader()).toBe(`default-src 'self'; script-src 'self' '${hash}'`);
  });

  it("does not restore cleared hashes from pending additions", async () => {
    const csp = new CspService({ "script-src": ["'self'"] });
    const pending = csp.addScript("go()");
    csp.clear();
    await pending;
    expect(csp.getCSPHeader()).toBe("script-src 'self'");
  });

  it("rejects header injection in policy configuration", () => {
    expect(() => new CspService({ "script-src": ["'self'\r\nx-other: value"] })).toThrow(TypeError);
    expect(() => new CspService({ "script-src; default-src": [] })).toThrow(TypeError);
  });
});

describe("withHash", () => {
  it("hashes the protected body, excludes attributes, and renders async children once", async () => {
    const csp = new CspService({ "script-src": ["'self'"] });
    const HashedScript = withHash(Script, csp);
    let calls = 0;
    async function Code() {
      calls++;
      return `const name = ${JSON.stringify("é </script><script>alert(1)</script> <!--")};`;
    }
    const html = await renderToString(
      <HashedScript data-label={">"}>
        <Code />
      </HashedScript>,
    );
    expect(html).not.toContain("</script><script>");
    expect(html).not.toContain("[object");
    expect(calls).toBe(1);
    const body = html.slice(html.indexOf("const name ="), -"</script>".length);
    expect(csp.getCSPHeader()).toContain(`'${await expectedHash(body)}'`);
  });

  it("keeps ordinary and external scripts usable without inline authorization", async () => {
    expect(await renderToString(<Script>go()</Script>)).toBe("<script>go()</script>");
    const csp = new CspService({ "script-src": ["'self'"] });
    const HashedScript = withHash(Script, csp);
    expect(await renderToString(<HashedScript src="/app.js" />)).toBe(
      '<script src="/app.js"></script>',
    );
    expect(csp.getCSPHeader()).toBe("script-src 'self'");
  });

  it("keeps parallel response collectors separate", async () => {
    const first = new CspService({ "script-src": ["'self'"] });
    const second = new CspService({ "script-src": ["'self'"] });
    const First = withHash(Script, first);
    const Second = withHash(Script, second);
    await Promise.all([
      renderToString(<First>{Promise.resolve("first()")}</First>),
      renderToString(<Second>second()</Second>),
    ]);
    expect(first.getCSPHeader()).toBe(`script-src 'self' '${await expectedHash("first()")}'`);
    expect(second.getCSPHeader()).toBe(`script-src 'self' '${await expectedHash("second()")}'`);
  });
});
