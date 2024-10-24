import { defineConfig } from "tsup";

export default defineConfig(options => ({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,

  // https://github.com/egoist/tsup/issues/619
  target: 'node16',
  platform: 'node',
  noExternal: [ /(.*)/ ],
}));
