"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  deviceLabel,
  finishRegistration,
  finishSignIn,
  removePasskey,
  startRegistration,
  startSignIn,
} from "@/lib/admin/passkeys";
import { createSession, requireAdmin } from "@/lib/admin/session";

/** Holds the id of the one challenge in flight. The row itself lives 5 minutes, like the cookie. */
const CHALLENGE_COOKIE = "pss_webauthn";
const SIGN_IN_FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const SETUP_FAILED = "Face ID couldn't be turned on. Try again.";

async function holdChallenge(challengeId: string): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, challengeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 5 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Reads and clears the challenge cookie, so a second attempt always starts afresh. */
async function takeChallenge(): Promise<string | undefined> {
  const store = await cookies();
  const challengeId = store.get(CHALLENGE_COOKIE)?.value;
  store.delete(CHALLENGE_COOKIE);
  return challengeId;
}

export type FaceIdSetupResult = { ok: true } | { error: string };

/** Registration only ever binds to the signed-in admin's own address, from the session. */
export async function beginFaceIdSetup(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const admin = await requireAdmin();
  const { options, challengeId } = await startRegistration(admin.email);
  await holdChallenge(challengeId);
  return options;
}

export async function completeFaceIdSetup(response: RegistrationResponseJSON): Promise<FaceIdSetupResult> {
  const admin = await requireAdmin();
  const challengeId = await takeChallenge();
  if (!challengeId) return { error: SETUP_FAILED };
  const label = deviceLabel((await headers()).get("user-agent"));
  const stored = await finishRegistration(admin.email, challengeId, response, label);
  if (!stored) return { error: SETUP_FAILED };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function beginFaceIdSignIn(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { options, challengeId } = await startSignIn();
  await holdChallenge(challengeId);
  return options;
}

/** `redirect` throws, so it stays outside any try/catch. */
export async function completeFaceIdSignIn(response: AuthenticationResponseJSON): Promise<{ error: string }> {
  const challengeId = await takeChallenge();
  const email = challengeId ? await finishSignIn(challengeId, response) : null;
  if (!email) return { error: SIGN_IN_FAILED };
  await createSession(email);
  redirect("/admin");
}

export async function removeFaceIdDevice(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (typeof id !== "string" || !id) return;
  await removePasskey(admin.email, id);
  revalidatePath("/admin/settings");
}
