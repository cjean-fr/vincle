import { useContext, raw, type JSX } from "@vincle/core";

import { createMarker, registerAsset, assertNameSafe } from "../assets.js";
import { Flow } from "../context.js";

type Awaitable<T> = T | Promise<T>;

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
  const { assets } = useContext(Flow);
  const { name, media, children: content } = props;

  assertNameSafe(name);

  const attrs: Record<string, string> = {};
  if (media != null) attrs["media"] = media;

  registerAsset(assets, name, { type: "style", content, attrs });
  return raw(createMarker("style", name)) as unknown as JSX.Element | null;
}

export function Script(props: ScriptProps): JSX.Element | null {
  const { assets } = useContext(Flow);
  const { name, src, module: isModule, defer: isDefer, children: content } = props;

  assertNameSafe(name);

  const attrs: Record<string, string | boolean> = {};
  if (src != null) attrs["src"] = src;
  if (isModule) attrs["type"] = "module";
  if (isDefer) attrs["defer"] = true;

  const resolvedContent = content ?? "";
  registerAsset(assets, name, {
    type: "script",
    content: resolvedContent,
    attrs,
  });
  return raw(createMarker("script", name)) as unknown as JSX.Element | null;
}
