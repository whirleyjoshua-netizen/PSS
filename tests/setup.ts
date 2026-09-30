import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Components render outside a mounted App Router in tests, so useRouter would
// throw. Files that assert on navigation mock this again with their own spy.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// next/font/local is a build-time transform. Under vitest it is a plain module that cannot load a
// font file, and any component that imports app/(site)/project/hand-font.ts would fail to import.
vi.mock("next/font/local", () => ({ default: () => ({ className: "font-hand", style: { fontFamily: "hand" } }) }));
