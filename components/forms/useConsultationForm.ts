"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { consultationSchema } from "@/lib/leads/schema";
import { recallAttribution } from "@/lib/leads/attribution";
import { trackLead } from "@/lib/analytics/events";

export type FormState = "idle" | "submitting" | "success" | "error";

/**
 * Shared submit logic for both consultation forms.
 *
 * Validation runs client-side with the same schema the route handler uses, so
 * a mistyped phone number is caught before it ever costs a round trip — and
 * the message the visitor sees is the same one the server would have sent.
 */
export function useConsultationForm(source: "hero" | "contact") {
  const router = useRouter();
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: String(data.get("name") ?? ""),
      phone: String(data.get("phone") ?? ""),
      email: String(data.get("email") ?? ""),
      city: String(data.get("city") ?? ""),
      address: str(data.get("address")),
      treatments: data.getAll("treatments").map(String),
      windowCount: str(data.get("windowCount")),
      heardVia: str(data.get("heardVia")),
      notes: str(data.get("notes")),
      referralCode: str(data.get("referralCode")),
      source,
      attribution: storedAttribution(),
      company: String(data.get("company") ?? ""),
    };

    const parsed = consultationSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details and try again.");
      setState("error");
      return;
    }

    setState("submitting");
    setError(null);

    try {
      const response = await fetch("/api/consultation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !result?.ok) {
        setError(result?.error ?? "We could not submit your request. Please call us.");
        setState("error");
        return;
      }

      form.reset();
      trackLead(source);
      // The inline success message covers the moment before navigation lands.
      setState("success");
      router.push("/thank-you");
    } catch {
      setError("We could not reach the server. Please check your connection or call us.");
      setState("error");
    }
  }

  return { state, error, submit };
}

function storedAttribution() {
  try {
    return recallAttribution(window.localStorage);
  } catch {
    return undefined;
  }
}

const str = (value: FormDataEntryValue | null): string | undefined => {
  const text = value == null ? "" : String(value).trim();
  return text.length > 0 ? text : undefined;
};
