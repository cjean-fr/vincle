import type { ConfigEnv } from "vite";

import type { DevOptions } from "./dev.js";
import type { SsgOptions } from "./types.js";

/** Shared build options, with development-only Vite overrides. */
export interface SsgConfig extends SsgOptions {
  dev?: Pick<DevOptions, "vite" | "notFound" | "redirects" | "statuses" | "mimeTypes">;
}
export type SsgConfigEnv = Pick<ConfigEnv, "command" | "mode">;
export type SsgConfigFactory = (env: SsgConfigEnv) => SsgConfig | Promise<SsgConfig>;
export type SsgConfigExport = SsgConfig | Promise<SsgConfig> | SsgConfigFactory;

export function defineConfig(config: SsgConfig): SsgConfig;
export function defineConfig(config: SsgConfigFactory): SsgConfigFactory;
export function defineConfig(config: Promise<SsgConfig>): Promise<SsgConfig>;
export function defineConfig(config: SsgConfigExport): SsgConfigExport;
/** Type-only helper; objects and functions are returned unchanged. */
export function defineConfig(config: SsgConfigExport): SsgConfigExport {
  return config;
}
