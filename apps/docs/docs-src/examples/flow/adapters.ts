import {
  TurboAdapter, // Turbo Streams — <turbo-frame> / <turbo-stream>, morph on Turbo >= 8
  HtmxAdapter, // HTMX — hx-get / hx-swap-oob, morph on htmx >= 4
  NativeAdapter, // <template for> + inline polyfill, all 5 positions
  WebPlatformAdapter, // WICG declarative partial updates, replace only
  EsiAdapter, // CDN edge composition via esi:include
} from "@vincle/flow/adapters";
