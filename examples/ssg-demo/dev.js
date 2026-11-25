// Entry point for browser playgrounds that run a file instead of `npm run dev`.
process.argv.splice(2, 0, "dev");
await import("./node_modules/@vincle/ssg/bin.js");
