"use server";

import { z } from "zod";
import { requestCustomerSignIn } from "@/lib/portal/login";

export type CustomerSignInState = { status: "idle" | "sent" | "error"; message?: string };

const email = z.string().trim().max(254).email("Enter a valid email address.");

/** Always "sent" for a well-formed email, whether or not it belongs to a customer. */
export async function requestCustomerSignInAction(
  _prev: CustomerSignInState,
  formData: FormData,
): Promise<CustomerSignInState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  await requestCustomerSignIn(parsed.data);
  return { status: "sent" };
}
