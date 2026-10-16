import { randomUUID } from "node:crypto";
import { vi } from "vitest";

process.env.NODE_ENV = "test";

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
