import path from "node:path";
import { pathToFileURL } from "node:url";

// Recognize only the complete, canonical module emitted for a single RawHtml
// node. Any imports, expressions, JSX, or changes to the compiler's module
// shape fall back to normal execution. JSON.parse reads the string literal;
// no generated JavaScript is evaluated here.
const provider = pathToFileURL(path.resolve(import.meta.dirname, "../mdx-components.jsx")).href;
const prefix = `import { jsx as _jsx } from "@vincle/core/jsx-runtime";
import { useMDXComponents as _provideComponents } from "${provider}";
function _createMdxContent(props) {
    const { RawHtml } = Object.assign({}, _provideComponents(), props.components);
    if (!RawHtml) _missingMdxReference("RawHtml", true);
    return _jsx(RawHtml, { html: `;
const suffix = ` });
}
function MDXContent(props = {}) {
    const { wrapper: MDXLayout } = Object.assign({}, _provideComponents(), props.components);
    return MDXLayout ? _jsx(MDXLayout, Object.assign({}, props, { children: _jsx(_createMdxContent, props) })) : _createMdxContent(props);
}
export default MDXContent;
function _missingMdxReference(id, component) {
    throw new Error("Expected " + (component ? "component" : "object") + " \u0060" + id + "\u0060 to be defined: you likely forgot to import, pass, or provide it.");
}
`;

export function staticMdxHtml(code: string): string | null {
  if (!code.startsWith(prefix) || !code.endsWith(suffix)) return null;
  try {
    const html: unknown = JSON.parse(code.slice(prefix.length, -suffix.length));
    return typeof html === "string" ? html : null;
  } catch {
    return null;
  }
}
