import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Components render outside a mounted App Router in tests, so useRouter would
// throw. Files that assert on navigation mock this again with their own spy.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
