import type { DiscoveredPage, SourceContext, SsgMeta } from "./types.js";

import { failure } from "./errors.js";
import { metadata } from "./metadata.js";
import { outputPathForRoute } from "./routes.js";

const PARAMETER = /\[([A-Za-z_]\w*)\]/g;

/** The parameter names of a route such as `/item/[id]`, in order. */
export function routeParameters(route: string): string[] {
  return [...route.matchAll(PARAMETER)].map((match) => match[1]!);
}

function invalid(file: string, message: string, hint: string, context: Record<string, string>) {
  return failure(message, { reason: "INVALID_ROUTE", hint, context: { file, ...context } });
}

function valueOf(file: string, name: string, value: unknown): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !text || /[/\\?#\0]/.test(text) || text === "." || text === "..")
    throw invalid(
      file,
      `Invalid value for route parameter [${name}]: ${typeof value === "string" ? JSON.stringify(value) : typeof value}`,
      "Use a non-empty string or finite number without /, \\, ?, # or NUL, and not . or .. : one parameter fills one path segment.",
      { parameter: name },
    );
  return text;
}

/**
 * A page whose file name has `[name]` segments becomes one page per entry of its
 * `paths` export: same source, layout, plugins and cache key, a concrete route.
 */
export async function expandDynamicPage(page: DiscoveredPage): Promise<DiscoveredPage[]> {
  const { source } = page;
  const names = routeParameters(source.route);
  if (!names.length) return [page];
  const file = source.relativePath;
  if (page.paths === undefined)
    throw invalid(
      file,
      `Dynamic route without a paths export: ${source.route}`,
      "Export paths from a .tsx, .jsx, .ts or .js page, returning the parameters to build, for example [{ params: { id: '1' } }]. Markdown cannot be a dynamic route. Rename a literal file whose name uses brackets.",
      { route: source.route },
    );
  const entries = await page.paths(source);
  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();
  for await (const entry of entries as AsyncIterable<unknown> | Iterable<unknown>) {
    const given = (entry as { params?: Record<string, unknown>; meta?: SsgMeta } | null)?.params;
    if (!given || typeof given !== "object")
      throw invalid(
        file,
        "A paths entry needs a params object.",
        "Return entries shaped like { params: { id: '1' }, meta?: { title } }.",
        { route: source.route },
      );
    const extra = Object.keys(given).filter((key) => !names.includes(key));
    const missing = names.filter((name) => !Object.hasOwn(given, name));
    if (extra.length || missing.length)
      throw invalid(
        file,
        `A paths entry must give exactly the parameters of ${source.route}.`,
        `Expected ${names.map((name) => `[${name}]`).join(", ")}${missing.length ? `; missing ${missing.join(", ")}` : ""}${extra.length ? `; unknown ${extra.join(", ")}` : ""}.`,
        { route: source.route },
      );
    const params: Record<string, string> = {};
    for (const name of names) params[name] = valueOf(file, name, given[name]);
    const route = source.route.replace(PARAMETER, (_, name: string) => params[name]!);
    if (seen.has(route))
      throw invalid(
        file,
        `Two paths entries build the same route: ${route}`,
        "Return each set of parameters once.",
        {
          route,
        },
      );
    seen.add(route);
    const derived: SourceContext = {
      ...source,
      route,
      params,
      outputPath: (extension) => outputPathForRoute(route, extension),
    };
    pages.push({
      ...page,
      source: derived,
      // Params come from changing data, so dev never reuses a cached render.
      meta: metadata(
        { incremental: false, ...page.meta, ...(entry as { meta?: SsgMeta }).meta },
        source.file,
      ),
    });
  }
  return pages;
}
