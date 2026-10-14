import type { DiscoverPagesOptions, DiscoveredPage, SsgPlugin } from "@vincle/ssg";

import path from "node:path";

interface DocumentationEngine {
  discoverDocumentation(options: DiscoverPagesOptions): Promise<DiscoveredPage[]>;
  documentationArtifacts: SsgPlugin;
}

/** Load the documentation shell through the active Vite graph, alongside its pages. */
export function documentation() {
  let engine: DocumentationEngine | undefined;
  return {
    async discover(options: DiscoverPagesOptions) {
      if (!options.modules) throw new Error("Documentation requires a module integration.");
      engine = (await options.modules.load(
        path.resolve("src/lib/documentation.ts"),
        "@vincle/core",
      )) as unknown as DocumentationEngine;
      return engine.discoverDocumentation(options);
    },
    artifacts: {
      name: "documentation-artifacts",
      async publish(context) {
        if (!engine) throw new Error("Documentation discovery must run before publication.");
        await engine.documentationArtifacts.publish?.(context);
      },
    } satisfies SsgPlugin,
  };
}
