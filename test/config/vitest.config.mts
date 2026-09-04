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
      reporter: ["json", "json-summary", "text-summary", "html"],
      // Logic-surface denominator: measure every runtime-branching file, even
      // those no test touches yet (`all`), so 100% is machine-verifiable and
      // regressions surface. Declarative/generated/wiring files carry no
      // branches and are excluded below.
      all: true,
      // Emit coverage even when tests fail — the campaign is TDD, red runs are
      // expected, and the coverage delta is still needed to steer the next slice.
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      exclude: [
        // Test files
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/*.e2e.test.ts",
        // Declarative / type-only (no runtime branches)
        "src/@types/**",
        "**/*.enum.ts",
        "**/*.d.ts",
        "**/*.type.ts",
        "**/*.types.ts",
        "**/types.ts",
        // Dead module: `getSentryConfig` has no importer and the DSN it returns
        // is hardcoded again in `src/shared/infrastructure/sentry/index.ts`.
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
