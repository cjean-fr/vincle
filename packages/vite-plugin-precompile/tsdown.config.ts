import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transformer.ts"],
  format: ["esm"],
  dts: true,
  minify: true,
  clean: true,
  platform: "node",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
