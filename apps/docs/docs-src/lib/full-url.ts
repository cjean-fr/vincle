/** Resolve a page route under the site's path and optional deployment base. */
export function fullUrl(route: string, site: string, base = "/"): string {
  const root = new URL(site);
  root.search = "";
  root.hash = "";
  root.pathname = root.pathname.replace(/\/+$/, "") + "/";
  const prefix = base.replace(/^\/+|\/+$/g, "");
  return new URL((prefix ? prefix + "/" : "") + route.replace(/^\/+/, ""), root).href;
}
