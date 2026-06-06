import {
  TurboAdapter, // Turbo Streams — <turbo-frame> / <turbo-stream>
  HtmxAdapter, // HTMX — hx-get / hx-swap-oob
  NativeAdapter, // <template for> + inline polyfill, all merge types
  WebPlatformAdapter, // WICG declarative partial updates, replace only
  EsiAdapter, // CDN edge composition via esi:include
} from "@vincle/flow/adapters";
