import type { SiteContent, SiteOptions, SiteOutput, PreparedSite } from "./outputs.js";

type Awaitable<T> = T | Promise<T>;

/** Shared metadata, supplied by every format and available to every plugin. */
export interface SsgMeta {
  title?: string;
  description?: string;
  sitemap?: boolean;
  /** Opt out of cached dev rendering for dynamic/time-dependent producers. */
  incremental?: boolean;
  /** Override the nearest _layout.tsx; relative to the source file. */
  layout?: string | false;
  [key: string]: unknown;
}

export interface JsxRuntime {
  /** Automatic JSX import source, for JSX, TSX and MDX alike. */
  importSource: string;
  /** Invokes the factory inside the runtime's render scope. */
  render(create: () => unknown): Awaitable<string>;
}

export interface SourceContext {
  file: string;
  src: string;
  relativePath: string;
  /** Extensionless route from the source hierarchy; index resolves to its parent. */
  route: string;
  /** File path relative to dist. HTML uses directory indexes by default. */
  outputPath(extension?: string): string;
  runtime: JsxRuntime;
  modules: ModuleLoader;
  /** Track a filesystem dependency; relative paths resolve beside the source. */
  watch(file: string): void;
}

export interface PageContext extends SourceContext {
  /** The same object is shared with the handler's renderer and all plugins. */
  meta: SsgMeta;
}

export interface SsgOutput extends SiteOutput {
  /** Override inclusion for this output. Non-HTML files are excluded by default. */
  sitemap?: boolean;
  /** Public URL path, when it differs from the output path. */
  url?: string;
}

export type SsgOutputs = SsgOutput | Iterable<SsgOutput> | AsyncIterable<SsgOutput>;
export type SsgProducer = (context: PageContext) => Awaitable<SsgOutputs>;

export interface SsgPage {
  meta?: SsgMeta;
  render: SsgProducer;
}

export interface PageHandler {
  name: string;
  /** Dev may reuse outputs until watched files/imports change. */
  incremental?: boolean;
  load(context: SourceContext): Awaitable<SsgPage>;
}

/** Source compilation can reuse the active asset integration's resolver/plugins. */
export interface ModuleLoader {
  watchFile?(file: string): void;
  load(file: string, importSource: string, compiled?: string): Promise<Record<string, unknown>>;
}

export interface DiscoveredPage extends SsgPage {
  source: SourceContext;
  handler: string;
  meta: SsgMeta;
}

export interface DiscoverPagesOptions {
  src?: string;
  handlers?: Readonly<Record<string, PageHandler | false>>;
  runtime?: JsxRuntime;
  modules?: ModuleLoader;
  concurrency?: number;
  excludeDirectories?: readonly string[];
}

export interface RenderedOutput extends Omit<SsgOutput, "content"> {
  content: SiteContent;
}

export interface PublicationContext extends PreparedSite {
  pages: readonly PageContext[];
}

export interface SsgPlugin {
  name: string;
  /** Page hooks are local and all file dependencies are declared with context.watch. */
  incremental?: boolean;
  /** Enrich shared metadata before layouts or rendering. */
  metadata?(context: PageContext): Awaitable<void>;
  /** Modify a lazy output before its producer is evaluated. */
  render?(output: SsgOutput, context: PageContext): Awaitable<SsgOutput | void>;
  /** Transform materialized text/binary content after rendering. */
  transform?(output: RenderedOutput, context: PageContext): Awaitable<RenderedOutput | void>;
  /** Inspect/add prepared files before any existing output is replaced. */
  publish?(context: PublicationContext): Awaitable<void>;
}

/** Optional asset builder, independent of any bundler. */
export interface AssetIntegration {
  prepare(context: {
    root: string;
    src: string;
    out: string;
    runtime: JsxRuntime;
  }): Awaitable<AssetBuild>;
}

export interface AssetBuild {
  /** Prepared asset files, copied into the site's output root. */
  directory: string;
  modules?: ModuleLoader;
  dispose?(): Awaitable<void>;
  /** Wraps the configured JSX renderer, e.g. to install a manifest in scope. */
  render?(runtime: JsxRuntime, create: () => unknown): Awaitable<string>;
}

export interface SsgOptions {
  /** Project root (default: cwd). All relative configuration paths use this root. */
  root?: string;
  /** Route sources (default: src). Names starting with . or _ are not routes. */
  src?: string;
  out?: string;
  /** Overrides or extends built-in handlers; false disables an extension. */
  handlers?: Readonly<Record<string, PageHandler | false>>;
  runtime?: JsxRuntime;
  plugins?: readonly SsgPlugin[];
  /** Absolute public site URL. Enables sitemap.xml unless sitemap is false. */
  site?: string;
  sitemap?: boolean;
  /** Auto-detect Vite configuration/client entry by default; false disables it. */
  assets?: AssetIntegration | false;
  copy?: SiteOptions["copy"];
  preserve?: SiteOptions["preserve"];
}

export type { SiteContent };
