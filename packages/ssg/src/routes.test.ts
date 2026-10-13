import { expect, test } from "bun:test";

import { outputPathForRoute } from "./routes.js";

test("keeps explicit output suffixes and uses directory indexes for extensionless HTML routes", () => {
  expect(outputPathForRoute("/404.html")).toBe("404.html");
  expect(outputPathForRoute("/errors/418.html")).toBe("errors/418.html");
  expect(outputPathForRoute("/")).toBe("index.html");
  expect(outputPathForRoute("/cv")).toBe("cv/index.html");
  expect(outputPathForRoute("/feed.xml", ".xml")).toBe("feed.xml");
});
