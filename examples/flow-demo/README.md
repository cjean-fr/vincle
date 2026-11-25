# Vincle Flow starter

A minimal streaming page built with [`@vincle/flow`](https://vincle.cjean.fr/integration/flow/overview).

The server sends the page shell at once. Two `<Defer>` blocks then arrive on their own, after about 1 s and 2.5 s, and replace their loading text. No client framework, no hydration.

```sh
npm install
npm run dev   # http://localhost:4321
```

- `server.tsx` holds the whole demo: two slow components, one page, one Node HTTP server.
- `dev.js` is the entry point for playgrounds that run a file instead of `npm run dev`.

## In a browser playground

- StackBlitz: opens, installs and starts `npm run dev` on its own. Reload the preview to replay the streaming.
- runbun.dev: choose "Install dependencies" in the menu next to Run, then press Run (`dev.js` starts the same server).
