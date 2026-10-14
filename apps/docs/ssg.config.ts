import { defineConfig } from "@vincle/ssg";

import { localeFor } from "./src/lib/i18n/locale.js";
import { documentation } from "./src/lib/ssg.js";

const integration = documentation();

export default defineConfig({
  site: "https://vincle.cjean.fr",
  i18n: { locales: ["en", "fr"], defaultLocale: "en" },
  discover: integration.discover,
  plugins: [integration.artifacts],
  dev: {
    notFound: (pathname) => (localeFor(pathname) === "fr" ? "/fr/404.html" : "/404.html"),
    statuses: { "/404.html": 404, "/fr/404.html": 404 },
  },
});
