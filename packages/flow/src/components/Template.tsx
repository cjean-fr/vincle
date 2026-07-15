import { useContext, type JSX, type VNode } from "@vincle/core";

import type { MergeType, OnError, TemplateContent } from "../types.js";

import { Flow } from "../context.js";

export interface TemplateProps {
  target: string;
  children: TemplateContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: VNode;
}

export function Template(props: TemplateProps): JSX.Element | null {
  const { config, registerTemplate } = useContext(Flow);
  const { target, children, merge, timeout, onError, fallback } = props;
  const isLazy = typeof children === "function";

  // Dev warning: fallback ignored for sync content
  if (!isLazy && fallback !== undefined) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn(
        `[vincle/flow] <Template target="${target}">: ` +
          "`fallback` is ignored for synchronous content (plain JSX). " +
          "Pass a factory function as children to use fallback: " +
          `<Template target="${target}" fallback={...}>{() => children}</Template>`,
      );
    }
  }

  registerTemplate(target, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
  });

  if (isLazy) {
    if (!config.adapter)
      throw new Error(
        "Template requires an adapter for lazy content. " +
          "Pass { adapter: ... } to renderToStatic " +
          "or use an adapter with renderToStream.",
      );

    return config.adapter.Placeholder({
      id: target,
      src: config.mode === "static" ? config.generatePath(target) : null,
      children: fallback ?? null,
    }) as JSX.Element | null;
  }

  // Sync content — no placeholder, just registration (was Fill)
  return null;
}
