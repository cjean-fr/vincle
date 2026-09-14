/**
 * @vincle/core/html — Shared primitives for build-time JSX transforms.
 *
 * Exports the constants and helpers that precompile tools need to replicate
 * the runtime's behavior at build time: attribute name resolution, escaping,
 * element classification, and URL safety.
 *
 * @module
 */

export { isVoidElement, isValidTag } from "./serialize.js";

export {
  isRawtextTag,
  escapeContent,
  escapeAttr,
  escapeRawTagContent,
  URL_ATTRIBUTES,
  schemeOf,
  isIterable,
  isAsyncIterable,
} from "./escape.js";

export { resolveAttrName, isValidAttrName, attrMeta } from "./attrs.js";
export type { AttrMeta } from "./attrs.js";
