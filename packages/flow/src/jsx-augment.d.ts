// Register the Turbo (Hotwire) custom elements used by `TurboAdapter` so they
// type-check against vincle's JSX. Vincle derives its intrinsic elements from
// `React.JSX.IntrinsicElements`, so augmenting it here flows through
// automatically (see @vincle/core's `types-jsx.ts`).
//
// We augment via `declare global` (not `declare module "react"`) because the
// latter breaks TypeScript 6's module resolution for `export =` modules.

import type * as React from "react";

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      "turbo-frame": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        target?: string;
      };
      "turbo-stream": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        action?: string;
        target?: string;
        method?: string;
      };
    }
  }
}
