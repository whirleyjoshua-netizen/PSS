"use server";

import { z } from "zod";
import { requestSignIn } from "@/lib/admin/login";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };

const email = z.string().trim().max(254).email("Enter a valid email address");

export async function requestSignInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  await requestSignIn(parsed.data);
  return { status: "sent" };
}
