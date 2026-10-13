export { dev, type DevOptions, type DevServer } from "./dev.js";
export { build } from "./build.js";
export { routeForFile, outputPathForRoute } from "./routes.js";
export { defaultHandlers } from "./formats.js";
export type {
  SsgOptions,
  SsgMeta,
  PageHandler,
  SsgPage,
  SourceContext,
  PageContext,
  SsgOutput,
  SsgOutputs,
  SsgProducer,
  SsgPlugin,
  JsxRuntime,
  AssetIntegration,
  AssetBuild,
  ModuleLoader,
  DiscoveredPage,
  DiscoverPagesOptions,
  RenderedOutput,
  PublicationContext,
} from "./types.js";
export {
  generateSite,
  type SiteContent,
  type SiteOutput,
  type SiteOptions,
  type PreparedSite,
} from "./outputs.js";
export { discoverPages } from "./handlers.js";
export { renderPage } from "./lifecycle.js";

export { SsgError, ERR_SSG_BUILD, type SsgErrorReason, type SsgErrorDetails } from "./errors.js";
