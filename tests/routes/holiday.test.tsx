import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  redirect,
}));

const page = async () => (await import("@/app/(site)/holiday/page")).default;
const atTime = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};
afterEach(() => vi.useRealTimers());

describe("/holiday", () => {
  it("is kept out of search, out of the sitemap, and rebuilt every minute", async () => {
    const mod = await import("@/app/(site)/holiday/page");
    expect(mod.metadata.robots).toEqual({ index: false, follow: true });
    expect(mod.revalidate).toBe(60);
    const sitemap = (await import("@/app/sitemap")).default;
    expect(sitemap().some((entry) => entry.url.endsWith("/holiday"))).toBe(false);
  });

  it("shows the 10% offer on Nov 10, with one form that files a holiday lead noting the offer", async () => {
    atTime("2026-11-10T12:00:00-08:00");
    const Page = await page();
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Get your home ready for the\s*Holidays/);
    expect(screen.getByText("10% off 3 or more custom shades or blinds. Book your free consult by Nov 15.")).toBeInTheDocument();
    expect(screen.getByText("What counts toward the 10%?")).toBeInTheDocument();
    // Nov 10 noon to the end of Nov 15 in Las Vegas is 5.5 days: the count rounds up.
    expect(screen.getByText("6 days left to book")).toBeInTheDocument();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector<HTMLInputElement>('input[name="notes"]')?.value).toMatch(/10%/);
    for (const label of ["More comfort", "Beautiful curb appeal", "A space you'll love"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("drops every 10% mention on Nov 16 and shows the family message", async () => {
    atTime("2026-11-16T09:00:00-08:00");
    const Page = await page();
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Give your home a fresh look before the family arrives.");
    expect(container.textContent).not.toMatch(/10%/);
    expect(container.querySelector('input[name="notes"]')).toBeNull();
    expect(screen.queryByText(/days left to book/)).toBeNull();
  });

  it("redirects to /consultation from Dec 25", async () => {
    atTime("2026-12-25T08:00:00-08:00");
    const Page = await page();
    expect(() => render(<Page />)).toThrow("redirect:/consultation");
  });
});
