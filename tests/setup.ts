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

// next/font/google is a build-time transform too. The holiday page (components/holiday/fonts.ts) loads its own pair.
vi.mock("next/font/google", () => {
  const font = (name: string) => () => ({ className: `font-${name}`, variable: `font-${name}-var`, style: { fontFamily: name } });
  return { Playfair_Display: font("playfair"), Great_Vibes: font("great-vibes") };
});
