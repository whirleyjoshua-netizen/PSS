"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeSignInCode, requestSignIn } from "@/lib/admin/login";
import { createSession } from "@/lib/admin/session";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const email = z.string().trim().max(254).email("Enter a valid email address");

export async function requestSignInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  await requestSignIn(parsed.data);
  return { status: "sent", email: parsed.data.trim().toLowerCase() };
}

export type CodeState = { error?: string };
const CODE_FAILED = "That code didn't work. Check it, or request a new one.";

/** Signs in with the emailed code. `redirect` throws, so it stays outside any try/catch. */
export async function verifySignInCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  const signedIn = await consumeSignInCode(email, code);
  if (!signedIn) return { error: CODE_FAILED };
  await createSession(signedIn);
  redirect("/admin");
}
