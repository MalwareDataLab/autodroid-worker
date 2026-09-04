import { vi } from "vitest";

process.env.NODE_ENV = "test";

vi.mock("@shared/infrastructure/sentry", () => ({
  Sentry: {
    init: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureEvent: vi.fn(),
    profiler: { startProfiler: vi.fn() },
  },
}));
