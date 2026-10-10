import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { consultationSchema } from "@/lib/leads/schema";
import { HeroForm } from "@/components/forms/HeroForm";

const lead = { name: "Dana Reyes", phone: "7025550134", email: "dana@example.com", city: "Las Vegas" };

describe("holiday leads", () => {
  it("accepts 'holiday' as a lead source", () => {
    expect(consultationSchema.safeParse({ ...lead, source: "holiday" }).success).toBe(true);
  });

  it("sends a page's note as a hidden notes field", () => {
    const { container } = render(<HeroForm source="holiday" notes="Holiday special" />);
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="notes"]')?.value).toBe("Holiday special");
  });

  it("sends no notes field when the page has none", () => {
    const { container } = render(<HeroForm />);
    expect(container.querySelector('input[name="notes"]')).toBeNull();
  });
});
