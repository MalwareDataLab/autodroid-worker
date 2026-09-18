import { randomUUID } from "node:crypto";
import { vi } from "vitest";

process.env.NODE_ENV = "test";

// Integration and e2e tests persist real files under
// `temp/test/<app>-<NAME>/`. Vitest runs test files in parallel, so a shared
// NAME would make files that touch the same CONFIGURATION key (for example
// `authentication.json`) race and corrupt each other. Give every test file its
// own storage root instead.
process.env.NAME = `vitest-${process.pid}-${randomUUID().slice(0, 8)}`;

vi.mock("@shared/infrastructure/sentry", () => ({
  Sentry: {
    init: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureEvent: vi.fn(),
    profiler: { startProfiler: vi.fn() },
  },
}));
