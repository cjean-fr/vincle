import { defineConfig } from "@vincle/ssg";

import { documentation } from "./src/lib/ssg.js";

const integration = documentation();

export default defineConfig({
  site: "https://vincle.cjean.fr",
  discover: integration.discover,
  plugins: [integration.artifacts],
  dev: {
    notFound: () => "/404.html",
    statuses: { "/404.html": 404 },
  },
});
