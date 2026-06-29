import { useContext, type JSX } from "@vincle/core";
import { Flow } from "../context.js";

// ClientFetch fetches an HTML fragment, so its `src` is a strict whitelist:
// http(s) or a relative path only.
type SchemeOf<S extends string> = S extends `${infer Head}:${string}`
  ? Head extends `${string}${"/" | "?" | "#"}${string}`
    ? null
    : Head extends ""
      ? null
      : Head
  : null;

type FetchUrl<S extends string> =
  SchemeOf<S> extends null
    ? S
    : Lowercase<SchemeOf<S> & string> extends "http" | "https"
      ? S
      : {
          __error: "ClientFetch needs an HTML URL — only http(s): or a relative path";
        };

export interface ClientFetchProps<S extends string = string> {
  src: S & FetchUrl<S>;
}

function isAllowedUrl(url: string): boolean {
  const colon = url.indexOf(":");
  if (colon === -1) return true;
  const preSlash = url.lastIndexOf("/", colon);
  const preQ = url.indexOf("?", colon);
  const preHash = url.indexOf("#", colon);
  if (preSlash !== -1 && preSlash < colon) return true;
  if (preQ !== -1 && preQ < colon) return true;
  if (preHash !== -1 && preHash < colon) return true;
  const scheme = url.slice(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https";
}

export function ClientFetch<const S extends string>(
  props: ClientFetchProps<S>,
): JSX.Element | null {
  const { config, nextId } = useContext(Flow);
  const id = nextId();

  if (!config.adapter) throw new Error("ClientFetch requires an adapter.");
  if (!isAllowedUrl(props.src))
    throw new Error(
      `ClientFetch: "${props.src}" has a forbidden scheme — only http(s): or relative paths are allowed`,
    );

  return config.adapter.Placeholder({
    id,
    src: props.src,
    children: null,
  }) as JSX.Element | null;
}
