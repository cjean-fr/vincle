// Public subpath: `@vincle/core/html`.
//
// Low-level HTML serialization primitives — the escaping/validation functions
// and the lookup tables the runtime uses to turn a JSX tree into a string.
// Exposed as a supported API so a compiler (e.g. the precompile transform)
// can produce output that is byte-identical to the runtime's, by reusing the
// exact same functions instead of reimplementing them.
export { VOID_ELEMENTS } from "./void-elements.js";
export {
  URL_ATTRIBUTES,
  RAWTEXT_TAGS,
  escapeAttr,
  isValidAttrName,
  isValidTagName,
} from "./escape.js";
export { ATTRIBUTE_NAME_MAP } from "./render-attributes.js";
