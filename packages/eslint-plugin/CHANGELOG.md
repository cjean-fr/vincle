# @vincle/eslint-plugin

## Unreleased

### Added

- New rule `@vincle/no-ambiguous-html-children` (error in `recommended`): a component receiving both `dangerouslySetInnerHTML` and children hides which source of content its contract uses. On HTML tags, the runtime already refuses the conflict at construction.

## 0.9.1 — 2026-10-05

- Refresh the packaged README with concise usage and Bun, pnpm, and npm installation commands.
