import { fullUrl } from "@vincle/ssg";

import ssg from "../../ssg.config.js";

export const meta = { title: "robots.txt", sitemap: false, search: false };

// Only directives understood by search crawlers and Lighthouse: agent
// discovery is advertised through Link headers instead.
export default function robots(): string {
  const lines = ["User-agent: *", "Allow: /"];
  if (ssg.site && ssg.sitemap !== false)
    lines.push("", `Sitemap: ${fullUrl("/sitemap.xml", ssg.site)}`);
  return lines.join("\n") + "\n";
}
