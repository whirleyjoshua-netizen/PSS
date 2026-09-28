import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";

/** The same origin rule as the sign-in link: configuration, never the request. */
export const adminSignInUrl = (): string => `${adminOrigin()}/admin/sign-in`;

/** True when the welcome email went out. Never throws: access is already given either way. */
export async function sendAccessEmail(to: string, addedBy: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) {
    console.error("Access email is not configured (missing RESEND_API_KEY).");
    return false;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`,
      to,
      subject: "You have access to the PSS admin",
      text: [
        `${addedBy} gave you access to the ${business.name} admin.`,
        "",
        "Sign in here:",
        adminSignInUrl(),
        "",
        "Sign in with this email address. We will email you a one-time link each time.",
      ].join("\n"),
    });
    if (error) {
      console.error("Access email failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Access email failed", error);
    return false;
  }
}
