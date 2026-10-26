---
name: vincle-blog
description: Use this skill when the user wants to create a blog with Vincle SSG, including posts, an index, tag pages and an RSS feed. Trigger on blog setup with @vincle/ssg, post listing, tag archives or feed generation.
license: MIT
compatibility: Node.js, Bun, Deno, Vite, esbuild, TypeScript
---

# Vincle blog

Build a blog with Vincle SSG: posts, an index, tag pages and an RSS feed.

## Follow the recipe

Read and follow https://vincle.cjean.fr/integration/ssg/blog.md. The docs win
over this skill. Do not copy the code from this skill; the recipe holds the
current files. For project setup, use the `vincle` skill and the installation
docs for the runtime and package manager in use.

## Decisive facts

- `discoverPages` routes are relative to its `src` option. With
  `src: "src/pages"`, a post is `/blog/first-post` and the index is `/blog`,
  so a post filter uses `/blog/` and the index stays out.
- Dates must be quoted YAML strings such as `date: "2026-03-02"`. Unquoted,
  YAML silently reads an invalid day as another date. A missing, unquoted or
  invalid date stops the build and names the file.
- Tags must be slugs: lowercase words joined by hyphens, because a tag is a
  path segment. Reject anything else, including `..`.
- The sitemap includes the index, the posts and the tag pages. The feed is
  excluded with `export const meta = { sitemap: false }` on the `.ts` page
  that writes `feed.xml`.

## Finish

Run the real build with `ssg generate` and run the type check. Report what was
created and what could not be verified.
