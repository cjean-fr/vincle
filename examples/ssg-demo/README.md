# Vincle SSG starter

A minimal static site built with [`@vincle/ssg`](https://vincle.cjean.fr/integration/ssg/overview).

- `src/pages/index.mdx` becomes `/`.
- `src/pages/about.tsx` becomes `/about`.
- `src/_layout.tsx` wraps every page.

```sh
npm install
npm run build   # writes dist/
npm run dev     # development server
```

## In a browser playground

- StackBlitz: opens, installs and starts `npm run dev` on its own.
- runbun.dev: choose "Install dependencies" in the menu next to Run, then press Run (`dev.js` starts the same server).
