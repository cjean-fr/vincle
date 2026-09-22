// WebMCP: expose the docs' key actions to AI agents running in the browser.
// https://webmachinelearning.github.io/webmcp/
//
// Registered on page load; on browsers without the API the module is a no-op.

import { loadIndex, search, type SearchDocument } from "../search/client.js";

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
}

interface ModelContext {
  registerTool: (tool: WebMcpTool) => void;
}

const searchDocs: WebMcpTool = {
  name: "searchDocs",
  description:
    "Full-text search across the Vincle documentation. Returns the best-matching " +
    "pages with their title, URL and a short excerpt.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Space-separated search terms." },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const query = String(args["query"] ?? "").trim();
    if (query === "") return "Provide a query.";
    const docs = await loadIndex();
    const hits = search(docs, query).slice(0, 5);
    if (hits.length === 0) return `No results for "${query}".`;
    return hits
      .map(
        (hit) => `- ${hit.document.title}: ${hit.document.url}\n  ${excerpt(hit.document, query)}`,
      )
      .join("\n");
  },
};

const openDocPage: WebMcpTool = {
  name: "openDocPage",
  description:
    "Open a Vincle documentation page in the current tab. Pass a same-site path " +
    "such as /guide/views, as returned by searchDocs or listed in /llms.txt.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Documentation page path, e.g. /guide/views" },
    },
    required: ["url"],
  },
  execute: async (args) => {
    const url = String(args["url"] ?? "");
    if (!url.startsWith("/") || url.startsWith("//") || url.includes(" ")) {
      return "Refused: url must be a same-site path (starts with /, no protocol, no spaces).";
    }
    location.assign(url);
    return `Opening ${url}`;
  },
};

function excerpt(document: SearchDocument, query: string, radius = 40): string {
  const firstTerm = query.split(/\s+/)[0]!;
  const at = document.text.toLowerCase().indexOf(firstTerm.toLowerCase());
  if (at < 0) {
    return document.text.slice(0, 80) + (document.text.length > 80 ? "…" : "");
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(document.text.length, at + firstTerm.length + radius);
  return (
    (start > 0 ? "…" : "") +
    document.text.slice(start, end) +
    (end < document.text.length ? "…" : "")
  );
}

const modelContext = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
if (modelContext !== undefined) {
  modelContext.registerTool(searchDocs);
  modelContext.registerTool(openDocPage);
}
