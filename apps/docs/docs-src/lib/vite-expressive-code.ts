import type { Plugin } from "vite";

import { expressiveCodeScript, expressiveCodeStyles } from "./expressive-code.js";

const MODULES = {
  "virtual:expressive-code.css": expressiveCodeStyles,
  "virtual:expressive-code.js": expressiveCodeScript,
} as const;

type VirtualId = keyof typeof MODULES;

const isVirtualId = (id: string): id is VirtualId => id in MODULES;

/**
 * Expressive Code's page-independent assets, as virtual modules, so `client.ts`
 * can import them into the hashed bundle. Generated rather than checked in: a
 * committed copy would drift from the theme config.
 *
 * The resolved ids keep their extension — Vite's CSS pipeline matches on it.
 */
export function expressiveCodeAssets(): Plugin {
  return {
    name: "docs:expressive-code-assets",
    resolveId(id) {
      return isVirtualId(id) ? `\0${id}` : null;
    },
    load(id) {
      const bare = id.startsWith("\0") ? id.slice(1) : id;
      return isVirtualId(bare) ? MODULES[bare]() : null;
    },
  };
}
