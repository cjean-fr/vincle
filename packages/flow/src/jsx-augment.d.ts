// Register the Turbo (Hotwire) custom elements used by `TurboAdapter` so they
// type-check against vincle's JSX. The generated table in `@vincle/core`
// covers standard HTML/SVG only, so custom elements are declared here, as type
// literals — a named `interface` cannot satisfy the custom-element index
// signature (TS2411).

import type { Awaitable, Renderable } from "@vincle/core";

declare module "@vincle/core/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "turbo-frame": {
        id?: Awaitable<string | number> | undefined;
        src?: Awaitable<string> | undefined;
        target?: Awaitable<string> | undefined;
        children?: Renderable;
      };
      "turbo-stream": {
        action?: Awaitable<string> | undefined;
        method?: Awaitable<string> | undefined;
        target?: Awaitable<string> | undefined;
        children?: Renderable;
      };
    }
  }
}
