import path from "node:path";

import { failure } from "./errors.js";

export function routeForFile(file: string, src: string): string {
  const relative = path.relative(path.resolve(src), path.resolve(file)).replace(/\\/g, "/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw failure(`Source is outside its root: ${file}`, {
      reason: "INVALID_ROUTE",
      hint: "Place the route source inside src, or set src to its containing route directory.",
      context: { file, src },
    });
  }
  const stem = relative.slice(0, -path.extname(relative).length || undefined);
  const route = stem === "index" ? "" : stem.endsWith("/index") ? stem.slice(0, -6) : stem;
  return `/${route}`;
}

export function outputPathForRoute(route: string, extension = ".html"): string {
  if (!/^\.[a-z\d]+$/i.test(extension))
    throw failure(`Invalid output extension: ${extension}`, {
      reason: "INVALID_ROUTE",
      hint: "Use a suffix such as .html, .json, .txt or .jpg, without path separators.",
      context: { route, extension },
    });
  if (
    !route.startsWith("/") ||
    route.includes("\\") ||
    route.includes("\0") ||
    /[?#]/.test(route)
  ) {
    throw failure(`Invalid route: ${route}`, {
      reason: "INVALID_ROUTE",
      hint: "Use an absolute URL path beginning with /, without query, fragment, empty internal segments or . and .. segments.",
      context: { route },
    });
  }
  const stem = route.slice(1).replace(/\/$/, "");
  if (stem.split("/").some((part) => part === "." || part === ".." || (!part && stem))) {
    throw failure(`Invalid route: ${route}`, {
      reason: "INVALID_ROUTE",
      hint: "Use an absolute URL path beginning with /, without query, fragment, empty internal segments or . and .. segments.",
      context: { route },
    });
  }
  if (path.posix.extname(stem) === extension) return stem;
  if (extension === ".html") return stem ? `${stem}/index.html` : "index.html";
  return `${stem || "index"}${extension}`;
}

/** Resolve a route under the configured public site URL, including its deployment path. */
export function fullUrl(route: string, site?: string | URL): string {
  if (site === undefined) return route;
  const root = new URL(site);
  root.search = "";
  root.hash = "";
  root.pathname = root.pathname.replace(/\/+$/, "") + "/";
  return new URL(route.replace(/^\/+/, ""), root).href;
}
