import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import {
  referralLabel,
  HEARD_VIA_OPTIONS,
  REFERRAL_SOURCES,
} from "@/lib/leads/referral";

function visit(search: string) {
  window.history.pushState({}, "", `/contact${search}`);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("referralLabel", () => {
  it("maps known short codes to their form labels", () => {
    expect(referralLabel("flyer")).toBe("Flyer");
    expect(referralLabel("van")).toBe("Saw our van");
    expect(referralLabel("yard")).toBe("Yard sign");
  });

  it("is case insensitive, since printed URLs get retyped", () => {
    expect(referralLabel("FLYER")).toBe("Flyer");
  });

  it("ignores anything unrecognized rather than inventing a source", () => {
    expect(referralLabel("chicken")).toBeUndefined();
    expect(referralLabel(null)).toBeUndefined();
    expect(referralLabel("")).toBeUndefined();
  });

  it("only maps to labels the form actually offers", () => {
    // A referral that prefills a value missing from the select would silently
    // leave the field blank, losing the attribution the QR code exists for.
    for (const label of Object.values(REFERRAL_SOURCES)) {
      expect(HEARD_VIA_OPTIONS).toContain(label);
    }
  });
});

describe("ConsultationForm referral prefill", () => {
  it("prefills the source when arriving from a flyer QR code", async () => {
    visit("?ref=flyer");
    render(<ConsultationForm />);

    await waitFor(() =>
      expect(screen.getByLabelText(/how did you hear/i)).toHaveValue("Flyer"),
    );
  });

  it("prefills a different source for the van code", async () => {
    visit("?ref=van");
    render(<ConsultationForm />);

    await waitFor(() =>
      expect(screen.getByLabelText(/how did you hear/i)).toHaveValue("Saw our van"),
    );
  });

  it("leaves the field unset with no referral", async () => {
    visit("");
    render(<ConsultationForm />);

    expect(screen.getByLabelText(/how did you hear/i)).toHaveValue("");
  });

  it("leaves the field unset for an unrecognized referral", async () => {
    visit("?ref=nonsense");
    render(<ConsultationForm />);

    expect(screen.getByLabelText(/how did you hear/i)).toHaveValue("");
  });
});
