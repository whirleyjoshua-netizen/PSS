"use server";

import { redirect } from "next/navigation";
import { consumeCustomerSignIn } from "@/lib/portal/login";
import { createCustomerSession } from "@/lib/portal/session";

/** Confirmed by a click on /project/auth, never by the GET alone. */
export async function completeCustomerSignIn(formData: FormData): Promise<void> {
  const token = formData.get("token");
  const email = typeof token === "string" && token ? await consumeCustomerSignIn(token) : null;
  if (!email) redirect("/project/sign-in?error=expired");

  await createCustomerSession(email);
  redirect("/project");
}
