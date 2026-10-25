import { describe, expect, it } from "bun:test";

import { search, type SearchHeading } from "../src/_client/search-rank.js";

const doc = (url: string, title: string, text: string, headings: SearchHeading[] = []) => ({
  url,
  title,
  headings,
  text,
});

describe("search", () => {
  it("ranks page title, then section heading, then text", () => {
    const docs = [
      // Partial title match plus URL: the heaviest score of the three.
      doc("/api/content/types", "JSX types", "content types of every attribute"),
      doc("/deployment", "Deployment", "Content types: hosts derive them", [
        { id: "content-types", text: "Content types" },
      ]),
      doc("/content-types", "Content types", "content types"),
    ];
    const hits = search(docs, "content types");
    expect(hits.map((hit) => hit.document.url)).toEqual([
      "/content-types",
      "/deployment",
      "/api/content/types",
    ]);
    expect(hits[0]?.heading).toBeUndefined();
    expect(hits[1]?.heading?.id).toBe("content-types");
  });

  it("needs every term in one heading, in any case", () => {
    const docs = [
      doc("/a", "A", "caching base path", [
        { id: "caching", text: "Caching" },
        { id: "base", text: "Serving under a base path" },
      ]),
    ];
    expect(search(docs, "BASE PATH")[0]?.heading?.id).toBe("base");
    expect(search(docs, "caching path")[0]?.heading).toBeUndefined();
  });
});

describe("search keywords", () => {
  it("finds a page by a keyword its text does not hold", () => {
    const docs = [
      { ...doc("/a", "Streaming", "async components"), keywords: ["suspense", "Out of order"] },
      doc("/b", "Other", "nothing relevant"),
    ];
    expect(search(docs, "suspense").map((hit) => hit.document.url)).toEqual(["/a"]);
    expect(search(docs, "OUT of").map((hit) => hit.document.url)).toEqual(["/a"]);
    expect(search(docs, "missing")).toEqual([]);
  });

  it("ranks a keyword above a passing mention in the text", () => {
    const docs = [
      doc("/mention", "Mention", "a passing note about suspense"),
      { ...doc("/tagged", "Tagged", "unrelated"), keywords: ["suspense"] },
    ];
    expect(search(docs, "suspense").map((hit) => hit.document.url)).toEqual([
      "/tagged",
      "/mention",
    ]);
  });

  it("leaves documents without keywords unchanged", () => {
    expect(search([doc("/a", "A", "text")], "text")).toHaveLength(1);
  });
});
