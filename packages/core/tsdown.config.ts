import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    html: "src/html.ts",
    "jsx-runtime": "src/jsx-runtime.ts",
    "jsx-dev-runtime": "src/jsx-dev-runtime.ts",
    "jsx-precompile-runtime": "src/jsx-precompile-runtime.ts",
  },
  format: "esm",
  clean: true,
});
