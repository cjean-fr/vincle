# @vincle/site

Generate a complete static site from text and binary outputs. No dependency on
Core, Flow, a JSX runtime, or a content format. Producers may render JSX, return
response bodies, compile stylesheets, or produce images.

```ts
import { generateSite } from "@vincle/site";

await generateSite({
  out: "dist",
  copy: [{ from: "public" }],
  preserve: ["assets"], // optional: files owned by Vite
  outputs: [
    { path: "index.html", content: () => renderHome() },
    { path: "photo.jpg", content: () => generatePhoto() },
  ],
});
```

`outputs` accepts an iterable or async iterable. Producers run in order; an
async generator can derive a search index from earlier page render results.
Content is a string, `Uint8Array`, or `ArrayBuffer`, supplied directly or by a
function. The returned `files` lists generated and copied files.

Paths are relative file paths, distinct from public URLs. Absolute paths,
traversal, symbolic copied files, duplicate files, and file/directory collisions
are rejected. Copied directories merge into the output root, or into their
optional `to` path. Generated outputs cannot overwrite copied files.

The output directory belongs to this build. Every existing top-level entry is
replaced except names declared in `preserve`. Preserved names are top-level
files or directories and cannot overlap generated or copied outputs. Use a
dedicated directory; do not place source files in it. Empty copied directories
are not emitted.

All production and validation finish in temporary directories before replacing
the published files. A production failure retains the previous build. Publication
is not atomic, and concurrent builds targeting the same directory are unsupported.
Errors carry `ERR_VINCLE_SITE_BUILD`; producer failures retain their cause and
name the affected output.

HTTP statuses, headers, URL mapping and deployment configuration belong to the
consumer. Writing a response body to a file does not preserve HTTP semantics.
