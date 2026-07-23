/**
 * Public subpath: `@vincle/core/html`.
 *
 * Low-level HTML serialization primitives — the exact escaping, validation and
 * assembly functions the runtime uses to turn a VNode tree into a string.
 *
 * Exposed as a supported API so that:
 *  - a build-time transform can emit output byte-identical to the runtime, and
 *  - `@vincle/flow` can build its own (streaming) renderer over the same VNode
 *    tree without reimplementing escaping or element assembly.
 *
 * Escaping only — no URL-scheme rewriting (see the security note in `index.ts`).
 */
export { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";
export { escapeAttr, buildAttrs, resolveAttrName, ATTRIBUTE_NAME_MAP, isEventHandler } from "./attrs.js";
export { serializeElement, isValidTag, invalidTagError, VOID_ELEMENTS } from "./serialize.js";
export { VNode } from "./jsx-runtime.js";
export { RawString, raw } from "./raw.js";
