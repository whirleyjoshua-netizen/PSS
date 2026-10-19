import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { INSURANCE, INSURED_FOOTER, INSURED_LINE, LICENSE_NUMBER } from "@/content/insurance";
import { FAQ_ITEMS } from "@/content/faq";
import { TrustBar } from "@/components/home/Sections";
import { Footer } from "@/components/layout/Footer";

const ROOT = path.resolve(__dirname, "../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** Today in Las Vegas, as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

describe("insurance", () => {
  // Red before the policy starts and after it lapses: the site must never say "insured" outside the policy period.
  it("is in force today", () => {
    expect(today() >= INSURANCE.effective, `policy starts ${INSURANCE.effective}`).toBe(true);
    expect(today() < INSURANCE.expires, `policy expired ${INSURANCE.expires}: renew and update content/insurance.ts`).toBe(true);
  });

  it("says $1M on the trust bar, matching the certificate", () => {
    expect(INSURANCE.perOccurrence).toBe(1_000_000);
    expect(INSURED_LINE).toContain("$1M");
    render(<TrustBar />);
    expect(screen.getByText("Insured")).toBeInTheDocument();
    expect(screen.getByText(INSURED_LINE)).toBeInTheDocument();
  });

  it("puts the insured line in the footer, and says licensed only once there is a licence number", () => {
    const { container } = render(<Footer />);
    expect(within(container).getByText(INSURED_FOOTER)).toBeInTheDocument();
    if (LICENSE_NUMBER === null) expect(container.textContent).not.toMatch(/licensed/i);
  });

  it("answers Are you insured? from the certificate's figures", () => {
    const item = FAQ_ITEMS.find((faq) => faq.q === "Are you insured?")!;
    expect(item.a).toContain("$1,000,000 per occurrence");
    expect(item.a).toContain("$2,000,000 in total");
    expect(item.a).toContain(INSURANCE.insurer);
  });

  it("never publishes the certificate or its policy number", () => {
    const offenders = ["app", "components", "content", "lib", "public"]
      .flatMap((dir) => files(path.join(ROOT, dir)))
      .filter((file) => /cert.*\.pdf$/i.test(file) || (/\.(ts|tsx|md|json)$/.test(file) && readFileSync(file, "utf8").includes("N8BP940780")));
    expect(offenders).toEqual([]);
  });
});
