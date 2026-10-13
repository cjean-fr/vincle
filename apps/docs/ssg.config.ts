import { defineConfig } from "@vincle/ssg";

import { localeFor } from "./src/lib/i18n/locale.js";
import { minimatchSearch } from "./src/lib/minimatch-build.js";
import { site as docs } from "./src/lib/site.js";
import { documentation } from "./src/lib/ssg.js";

const integration = documentation();

export default defineConfig({
  site: docs.site ? new URL(docs.base.replace(/^\//, ""), `${docs.site}/`).href : undefined,
  sitemap: docs.sitemap,
  i18n: { locales: ["en", "fr"], defaultLocale: "en" },
  discover: integration.discover,
  plugins: [minimatchSearch(), integration.artifacts],
  dev: {
    notFound: (pathname) => (localeFor(pathname) === "fr" ? "/fr/404.html" : "/404.html"),
    statuses: { "/404.html": 404, "/fr/404.html": 404 },
  },
});
