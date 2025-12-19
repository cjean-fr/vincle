import { useContext, type JSX, type Awaitable } from "@vincle/core";

import { markEmitted, registerAsset } from "../assets.js";
import { Flow } from "../context.js";

// `<Style>` and `<Script>` emit their tag at their own position, once per
// name — "first occurrence wins" needs no bookkeeping beyond a `Set`, since
// components run in document order.

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

/** The content, evaluated only if this occurrence is the one that emits. */
const evaluate = (content: string | (() => Awaitable<string>)): Awaitable<string> =>
  typeof content === "function" ? content() : content;

export function Style(props: StyleProps): JSX.Element | null {
  const { assets } = useContext(Flow);
  const { name, media, children: content } = props;

  const attrs: Record<string, string> = {};
  if (media != null) attrs["media"] = media;

  registerAsset(assets, name, { type: "style", content, attrs });
  if (!markEmitted(assets, name)) return null;

  return (
    <style data-name={name} {...attrs}>
      {evaluate(content)}
    </style>
  );
}

export function Script(props: ScriptProps): JSX.Element | null {
  const { assets } = useContext(Flow);
  const { name, src, module: isModule, defer: isDefer, children: content } = props;

  const attrs: Record<string, string | boolean> = {};
  if (src != null) attrs["src"] = src;
  if (isModule) attrs["type"] = "module";
  if (isDefer) attrs["defer"] = true;

  const resolvedContent = content ?? "";
  registerAsset(assets, name, { type: "script", content: resolvedContent, attrs });
  if (!markEmitted(assets, name)) return null;

  return (
    <script data-name={name} {...attrs}>
      {evaluate(resolvedContent)}
    </script>
  );
}
