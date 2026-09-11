"use server";

import { redirect } from "next/navigation";
import { consumeSignIn } from "@/lib/admin/login";
import { createSession } from "@/lib/admin/session";

/** Confirmed by a click on the confirm screen at /admin/auth, never by the GET alone. */
export async function completeSignIn(formData: FormData): Promise<void> {
  const token = formData.get("token");
  const email = typeof token === "string" && token ? await consumeSignIn(token) : null;
  if (!email) redirect("/admin/sign-in?error=expired");

  await createSession(email);
  redirect("/admin");
}
