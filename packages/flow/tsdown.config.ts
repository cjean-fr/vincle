import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/index.ts",
    "src/components/index.ts",
    "src/http.ts",
    "src/utils.ts",
    "src/types.ts",
    "src/context.ts",
    "src/assets.ts",
  ],
  format: ["esm"],
  dts: true,
  minify: true,
  clean: true,
  platform: "node",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
