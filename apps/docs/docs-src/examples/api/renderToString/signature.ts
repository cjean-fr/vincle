import type { VNode } from "@vincle/core";

declare function renderToString(node: VNode): Promise<string>;
