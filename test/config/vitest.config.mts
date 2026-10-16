import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

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
      reporter: ["json", "json-summary", "text-summary", "html"],
      all: true,
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/*.e2e.test.ts",
        "src/@types/**",
        "**/*.enum.ts",
        "**/*.d.ts",
        "**/*.type.ts",
        "**/*.types.ts",
        "**/types.ts",
        "src/shared/config/sentry.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
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
