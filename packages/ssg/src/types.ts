import type { SiteContent, SiteOptions, SiteOutput, PreparedSite } from "./outputs.js";

type Awaitable<T> = T | Promise<T>;

/** Shared metadata, supplied by every format and available to every plugin. */
export interface SsgMeta {
  title?: string;
  /** BCP 47 language of this page. */
  locale?: string;
  /** Stable identifier shared by existing translations, independent of their URLs. */
  translationKey?: string;
  /** Exclude this page from search integrations. */
  search?: boolean;
  description?: string;
  sitemap?: boolean;
  /** Opt out of cached dev rendering for dynamic/time-dependent producers. */
  incremental?: boolean;
  /** Invalidate cached HTML when discovery-derived dependencies change. */
  renderKey?: string;
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
  /** Output-specific metadata, merged over the source metadata. */
  meta?: SsgMeta;
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

/** A generated HTML page; content is read lazily from the prepared publication. */
export interface PublishedPage {
  path: string;
  url: string;
  meta: Readonly<SsgMeta>;
  read(): Promise<string>;
}

export interface PublicationContext extends PreparedSite {
  pages: readonly PageContext[];
  /** Final HTML outputs, including cached pages, available to search and other integrations. */
  outputs: readonly PublishedPage[];
}

export interface SsgI18n {
  locales: readonly string[];
  defaultLocale: string;
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

/** Context shared by every asset integration preparation. */
export interface AssetContext {
  /** Absolute project root. */
  root: string;
  /** Absolute route source directory. */
  src: string;
  /** Absolute integration-private preparation directory; its container is created by the core. */
  out: string;
  runtime: JsxRuntime;
  /** Public path prefix from SsgOptions.base, e.g. "/docs/"; undefined leaves the bundler's own base. */
  base?: string;
}

/**
 * Asset builder composed alongside the pages: client bundles, generated images or any
 * other files published next to the output. Independent of any bundler.
 *
 * SsgOptions.assets accepts one integration, an array of integrations (prepared, copied,
 * wrapping and released in declaration order) or false. Without an explicit value the
 * conventional Vite integration is detected.
 */
export interface AssetIntegration {
  /** Build preparation; `directory` is copied into the site's output root. */
  prepare(context: AssetContext): Awaitable<AssetBuild>;
  /**
   * Development pendant. Present: the development server prepares this integration once
   * per session and reuses the build across rebuilds. Absent: `prepare` runs on every rebuild.
   */
  dev?(context: AssetContext): Awaitable<AssetBuild>;
}

/** One prepared asset integration. */
export interface AssetBuild {
  /** Prepared asset directory, copied into the site's output root; relative paths resolve from root. */
  directory: string;
  /** Source module loader; at most one integration per build may provide one. */
  modules?: ModuleLoader;
  /** Files whose modification triggers a development rebuild; resolved from root, ignored by builds. */
  watch?: readonly string[];
  /** Release resources once per build, in reverse declaration order, best-effort after publication. */
  dispose?(): Awaitable<void>;
  /** Wraps the configured JSX renderer. Later integrations wrap earlier ones. */
  render?(runtime: JsxRuntime, create: () => unknown): Awaitable<string>;
}

export interface SsgOptions {
  /** Project root (default: cwd). All relative configuration paths use this root. */
  root?: string;
  /** Route sources (default: src/pages when present, otherwise src). Names starting with . or _ are not routes. */
  src?: string;
  out?: string;
  /** Customize discovery; use the supplied discover function to retain dev caching. */
  discover?(
    options: DiscoverPagesOptions,
    discover: (options: DiscoverPagesOptions) => Promise<DiscoveredPage[]>,
  ): Awaitable<readonly DiscoveredPage[]>;
  i18n?: SsgI18n;
  /** Overrides or extends built-in handlers; false disables an extension. */
  handlers?: Readonly<Record<string, PageHandler | false>>;
  runtime?: JsxRuntime;
  plugins?: readonly SsgPlugin[];
  /** Public site origin, e.g. https://example.com. Enables sitemap.xml unless sitemap is false. */
  site?: string;
  /** Path prefix the site is served under, e.g. "/docs/" (default "/"). Applies to sitemap and asset URLs. */
  base?: string;
  sitemap?: boolean;
  /**
   * Asset integrations, prepared, copied, wrapping the renderer and released in declaration
   * order. One integration is accepted for compatibility; an explicit array (`[]` included)
   * disables conventional detection; false disables all integrations. When omitted, the
   * conventional Vite integration is detected from vite.config or client entries.
   */
  assets?: AssetIntegration | readonly AssetIntegration[] | false;
  copy?: SiteOptions["copy"];
  preserve?: SiteOptions["preserve"];
}

export type { SiteContent };
