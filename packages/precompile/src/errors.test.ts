import { describe, it, expect } from "bun:test";

import {
  ERR_PRECOMPILE_CONFIG,
  ERR_PRECOMPILE_HELPER,
  ERR_PRECOMPILE_INTERNAL,
  vincleError,
} from "./errors.js";

describe("error codes", () => {
  it("are the stable published codes (API — never renamed, never emptied)", () => {
    // Pinned to the literal values: these are public API. A rename — or an
    // accidental emptying — would silently break anyone matching on a code,
    // with no error at the throw site to point at.
    expect(ERR_PRECOMPILE_CONFIG).toBe("ERR_VINCLE_PRECOMPILE_CONFIG");
    expect(ERR_PRECOMPILE_HELPER).toBe("ERR_VINCLE_PRECOMPILE_HELPER");
    expect(ERR_PRECOMPILE_INTERNAL).toBe("ERR_VINCLE_PRECOMPILE_INTERNAL");
  });

  it("stamps the code onto a plain Error, enumerable like Node's own", () => {
    const err = vincleError("boom", ERR_PRECOMPILE_HELPER);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
    expect(err).toHaveProperty("code", "ERR_VINCLE_PRECOMPILE_HELPER");
    // Enumerable: a logger that spreads the error carries the code with it.
    expect(Object.keys(err)).toContain("code");
    expect(Object.assign({}, err).code).toBe("ERR_VINCLE_PRECOMPILE_HELPER");
  });
});
