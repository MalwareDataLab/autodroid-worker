import { defineConfig } from "tsup";

export default defineConfig(options => ({
  entry: ["./src/index.ts"],
  format: ["cjs"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  bundle: true,
}));
