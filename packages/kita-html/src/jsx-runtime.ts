import type { Children } from './index.js'
import {
  attributesToString,
  contentsToString,
  contentToString,
  Fragment,
  isVoidElement
} from './index.js'

// Profiling hooks (same pattern as @vincle/core-2)
export let PROFILE = { attrMs: 0, contentMs: 0 }
const _t = () => performance.now()

/**
 * Generates a html string from an attribute name of component and it's props.
 *
 * This function is meant to be used by the jsx runtime and should not be called directly.
 *
 * @param name The name of the element to create or another component function
 * @param attributes The props to apply to the component
 * @returns The generated html string or a promise that resolves to the generated html
 *   string
 */
export function jsx(
  this: void,
  name: string | Function,
  attributes: { children?: Children; [k: string]: any }
): JSX.Element {
  // Calls the element creator function if the name is a function
  if (typeof name === 'function') {
    return name(attributes)
  }

  // Switches the tag name when this custom `tag` is present.
  if (name === 'tag') {
    name = attributes.of as string
  }

  const t0 = _t()
  const attrs = attributesToString(attributes)
  PROFILE.attrMs += _t() - t0

  if (attributes.children === undefined) {
    if (isVoidElement(name as string)) {
      return `<${name}${attrs}/>`
    }
    return `<${name}${attrs}></${name}>`
  }

  const t1 = _t()
  const contents = contentToString(attributes.children, attributes.safe)
  PROFILE.contentMs += _t() - t1

  if (contents instanceof Promise) {
    return contents.then(function resolveContents(child) {
      return `<${name}${attrs}>${child}</${name}>`
    })
  }

  return `<${name}${attrs}>${contents}</${name}>`
}

/**
 * Generates a html string from an attribute name of component and it's props.
 *
 * This function is meant to be used by the jsx runtime and should not be called directly.
 *
 * @param name The name of the element to create or another component function
 * @param attributes The props to apply to the component
 * @returns The generated html string or a promise that resolves to the generated html
 *   string
 */
export function jsxs(
  this: void,
  name: string | Function,
  attributes: { children: Children[]; [k: string]: any }
): JSX.Element {
  // Calls the element creator function if the name is a function
  if (typeof name === 'function') {
    return name(attributes)
  }

  // Switches the tag name when this custom `tag` is present.
  if (name === 'tag') {
    name = attributes.of as string
  }

  const t0 = _t()
  const attrs = attributesToString(attributes)
  PROFILE.attrMs += _t() - t0

  if (attributes.children.length === 0) {
    if (isVoidElement(name as string)) {
      return `<${name}${attrs}/>`
    }
    return `<${name}${attrs}></${name}>`
  }

  const t1 = _t()
  const contents = contentsToString(attributes.children, attributes.safe)
  PROFILE.contentMs += _t() - t1

  if (contents instanceof Promise) {
    return contents.then(function resolveContents(child) {
      return `<${name}${attrs}>${child}</${name}>`
    })
  }

  return `<${name}${attrs}>${contents}</${name}>`
}

// According to the jsx-runtime spec we must export the fragment element also
export { Fragment }
