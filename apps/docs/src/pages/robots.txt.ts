import config from "../../docs.config.js";
import { fullUrl } from "../lib/full-url.js";

export const meta = { title: "robots.txt", sitemap: false, search: false };

// Only directives understood by search crawlers and Lighthouse: agent
// discovery is advertised through Link headers instead.
export default function robots(): string {
  const lines = ["User-agent: *", "Allow: /"];
  if (config.site && config.sitemap)
    lines.push("", `Sitemap: ${fullUrl("/sitemap.xml", config.site, config.base)}`);
  return lines.join("\n") + "\n";
}
