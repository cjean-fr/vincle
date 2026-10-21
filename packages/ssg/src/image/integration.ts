import { Scope } from "@vincle/core";
import path from "node:path";

import type { AssetBuild, AssetContext, AssetIntegration } from "../types.js";
import type { ImageOptions } from "./types.js";

import { createImageCache } from "./cache.js";
import { prepareImage } from "./generate.js";
import { setImages } from "./scope.js";
import { validateImages } from "./validate.js";

/**
 * Generate every declared image variant into the site's output.
 *
 * Configuration is validated synchronously here, so a malformed descriptor fails with
 * `INVALID_CONFIG` naming it instead of mid-build. The returned integration is an
 * ordinary asset integration without a development pendant: `prepare` runs on every
 * rebuild and build, and the per-instance memo (source path plus modification time and
 * size) skips decoding and encoding that are still valid. Generation failures surface
 * as `ASSETS_FAILED` with `context.image`, plus `context.source` or `context.variant`.
 *
 * Declared masters are reported as `watch` paths, so editing one rebuilds the site in
 * development. `context.base` is not applied here: the base belongs to rendered URLs,
 * not to generated files. The memo lives as long as this configuration instance; there
 * is no `dispose`.
 *
 * `prepare` also wraps the renderer: each page render installs the descriptors and the
 * base for `<Picture>`, then renders. Renders are chained in declaration order and every
 * installation lands in the innermost scope, in that same order, so with two `images()`
 * calls in one build the **last declared** integration's registry is the one pages read;
 * the other call still generates its files.
 *
 * The converter is project code and is not sandboxed. Nothing else is required: no
 * image dependency, no bundler, no network access.
 *
 * @param options Converter and descriptors; both are read again on every preparation.
 */
export function images(options: ImageOptions): AssetIntegration {
  validateImages(options);
  const { converter, descriptors } = options;
  // One memo per declared configuration: its lifetime is exactly that of this instance.
  const cache = createImageCache();
  return {
    async prepare(context: AssetContext): Promise<AssetBuild> {
      await prepareImage({
        root: context.root,
        out: context.out,
        converter,
        descriptors,
        cache,
      });
      // Two descriptors may share a master; the watcher receives one path per master.
      const sources = [
        ...new Set(descriptors.map((descriptor) => path.resolve(context.root, descriptor.source))),
      ];
      return {
        directory: context.out,
        watch: sources,
        // Same shape as viteAssets(): the registry is installed inside the callback the
        // runtime renders, so it lands in the scope the page reads (Scope.with starts a
        // fresh map, an installation in the outer scope would not be inherited).
        render: (runtime, create) =>
          Scope.with(() =>
            runtime.render(() => {
              setImages(descriptors, { base: context.base });
              return create();
            }),
          ),
      };
    },
  };
}
