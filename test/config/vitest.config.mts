import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import swc from "unplugin-swc";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 30000,
    globals: true,
    reporters: [
      "verbose",
      ["html", { outputFile: "test/outputs/reporters/html/index.html" }],
    ],
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: "test/outputs/coverage",
      reporter: ["json", "html"],
    },
    workspace: "test/config/vitest.workspace.ts",
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
  },
  plugins: [swc.vite(), tsconfigPaths()],
});
