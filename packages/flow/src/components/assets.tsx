import { Scope, snapshotContext, type JSX, type Awaitable } from "@vincle/core";
import { raw } from "@vincle/core";

import { claimAsset } from "../assets.js";
import { Flow } from "../context.js";

// `<Style>` and `<Script>` emit their tag at their own position, once per
// name. Concurrent siblings reach occurrences in completion order, so the
// component only *claims*: it leaves a mark, and `resolveAssets` renders the
// tag of the first occurrence of a name in document order, after the render.
// That is also what keeps a losing occurrence's factory unevaluated. The
// claim captures the tree frame and the Scope, like `<Defer>` does, so the
// winning factory still runs in the context of its own position even though
// it is evaluated after the render.

interface BaseAssetProps {
  name: string;
}

export interface StyleProps extends BaseAssetProps {
  media?: string;
  children: string | (() => Awaitable<string>);
}

export interface ScriptProps extends BaseAssetProps {
  src?: string;
  module?: boolean;
  defer?: boolean;
  children?: string | (() => Awaitable<string>);
}

export function Style(props: StyleProps): JSX.Element | null {
  const { assets } = Scope.get(Flow);
  const { name, media, children: content } = props;

  const attrs: Record<string, string> = {};
  if (media != null) attrs["media"] = media;

  const mark = claimAsset(assets, name, {
    type: "style",
    content: captureContext(content),
    attrs,
  });
  if (!mark) return null;
  return raw(mark);
}

export function Script(props: ScriptProps): JSX.Element | null {
  const { assets } = Scope.get(Flow);
  const { name, src, module: isModule, defer: isDefer, children: content } = props;

  const attrs: Record<string, string | boolean> = {};
  if (src != null) attrs["src"] = src;
  if (isModule) attrs["type"] = "module";
  if (isDefer) attrs["defer"] = true;

  const resolvedContent = content ?? "";
  const mark = claimAsset(assets, name, {
    type: "script",
    content: captureContext(resolvedContent),
    attrs,
  });
  if (!mark) return null;
  return raw(mark);
}

/**
 * Bind a content factory to the tree frame and Scope of its claim, so a
 * factory evaluated at resolution time reads the context of its document
 * position: the same capture `<Defer>` takes for its own deferred work.
 * A plain string wraps unchanged; only factories can read context.
 */
const captureContext = (
  content: string | (() => Awaitable<string>),
): string | (() => Awaitable<string>) => {
  if (typeof content !== "function") return content;
  const resume = snapshotContext();
  const seed = Scope.snapshot();
  return () => resume(() => Scope.with(content, seed));
};
