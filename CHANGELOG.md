# Vincle workspace

Package changes are recorded in each package's `CHANGELOG.md`.

## 2026-10-31

### Changed

- Docs: use `ssg generate` through a Turbo `generate` task for the docs build. `ssg build` stays as a deprecated alias.
- Docs: remove the unused French localization layer and the configuration framework, which are replaced by plain modules; cache syntax highlighting on disk; show the search shortcut that matches the platform.
- Docs: reorganize `llms.txt` along the documentation's sidebar hierarchy and link it from the footer of every page.
- Docs: rebuild the installation and setup guides around from-scratch Node and Bun projects, and the coming-from-templates guide around the HTML-you-know bridge.

### Added

- Docs: a recipe that builds a blog from files, with a feed and tag pages, checked against a real build; the `vincle-blog` agent skill points to it from the installation page.
- Docs: a callout on the installation page with a copyable setup prompt for coding agents, with and without the `vincle` agent skill.
- Docs: replay the streaming demo's real wire output next to its code on the home page.
- Docs: highlight the code lines listed in a fence's `{1,3-5}` meta.
- Docs: render mermaid fences as diagrams at build time.
- Docs: show a tab and category breadcrumb in search results, and declare `BreadcrumbList` structured data on documentation pages.
- Skill: map React's `defaultValue`, `defaultChecked` and `defaultSelected` to the HTML `value`, `checked` and `selected` attributes in the `vincle` agent skill's migration table.

### Fixed

- Docs: give published pages distinct titles and a stable website name in structured data, and keep the icon file header comment out of rendered pages.

## 2026-10-25

### Added

- Docs: accept `keywords` in a page's frontmatter or `meta`, as a list or a comma-separated string. They are added to the search index for words the page text does not contain, a keyword match ranks above a passing mention in the text, and the page head gets a `<meta name="keywords">` tag.

## 2026-10-11

### Changed

- Use Bun 1.4.3 native type checking for workspace checks. Keep TypeScript 6 for published declaration compatibility checks and `tsc` for output generation.

### Added

- Add `check:packed` to the main check pipeline. It builds all seven distributable packages, extracts their Bun-generated tarballs into a temporary dependency tree, verifies export and executable paths, checks published declarations and JSX compilation, and exercises rendering and imports under Bun and Node.js when available. External dependencies use the workspace's installed versions.

### Fixed

- Resolve release workflow package names from their manifests when validating build commands, including the unscoped `create-vincle` package.
