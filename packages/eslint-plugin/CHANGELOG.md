# @vincle/eslint-plugin

## Unreleased

### Added

- New rule `@vincle/no-foreign-rawtext` (warning in `recommended`): the text of a `<script>` or `<style>` inside `<svg>` or `<math>` is parsed as markup, not raw text, so a `<` there opens a tag. Integration points (`foreignObject`, `desc`, `title`, MathML text elements, `annotation-xml` with an HTML encoding) switch back to HTML and are not flagged, and neither is the documented `raw(escapeContent(source))` recipe, recognized through the file's direct imports by resolving the callee through the scope chain.

## 0.10.0 — 2026-11-01

### Added

- New rule `@vincle/no-ambiguous-html-children` (error in `recommended`): a component receiving both `dangerouslySetInnerHTML` and children hides which source of content its contract uses. On HTML tags, the runtime already refuses the conflict at construction.

## 0.9.1 — 2026-10-05

- Refresh the packaged README with concise usage and Bun, pnpm, and npm installation commands.
