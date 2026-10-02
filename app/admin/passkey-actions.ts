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

/**
 * Each holds the id of the one challenge in flight for its purpose. The row itself lives 5 minutes,
 * like the cookie. Two names, so getting sign-in ready never overwrites a setup in flight.
 */
const SIGN_IN_COOKIE = "pss_webauthn_signin";
const SETUP_COOKIE = "pss_webauthn_reg";
type ChallengeCookie = typeof SIGN_IN_COOKIE | typeof SETUP_COOKIE;
/** Set and cleared on the same path, or the browser keeps the old cookie. */
const COOKIE_PATH = "/admin";
const SIGN_IN_FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const SETUP_FAILED = "Face ID couldn't be turned on. Try again.";

async function holdChallenge(name: ChallengeCookie, challengeId: string): Promise<void> {
  (await cookies()).set(name, challengeId, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 5 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Reads and clears the challenge cookie, so a second attempt always starts afresh. */
async function takeChallenge(name: ChallengeCookie): Promise<string | undefined> {
  const store = await cookies();
  const challengeId = store.get(name)?.value;
  store.delete({ name, path: COOKIE_PATH });
  return challengeId;
}

export type FaceIdSetupResult = { ok: true } | { error: string };

/** Registration only ever binds to the signed-in admin's own address, from the session. */
export async function beginFaceIdSetup(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const admin = await requireAdmin();
  const { options, challengeId } = await startRegistration(admin.email);
  await holdChallenge(SETUP_COOKIE, challengeId);
  return options;
}

export async function completeFaceIdSetup(response: RegistrationResponseJSON): Promise<FaceIdSetupResult> {
  const admin = await requireAdmin();
  const challengeId = await takeChallenge(SETUP_COOKIE);
  if (!challengeId) return { error: SETUP_FAILED };
  const label = deviceLabel((await headers()).get("user-agent"));
  const stored = await finishRegistration(admin.email, challengeId, response, label);
  if (!stored) return { error: SETUP_FAILED };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Null when too many sign-ins are already waiting. The page then shows the failure. */
export async function beginFaceIdSignIn(): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const started = await startSignIn();
  if (!started) return null;
  await holdChallenge(SIGN_IN_COOKIE, started.challengeId);
  return started.options;
}

/**
 * Only a failure comes back. `forgetPasskey` tells the phone its passkey is no longer known here
 * (removed in Settings), so it stops treating Face ID as on. The words stay the same either way.
 */
export type FaceIdSignInFailure = { error: string; forgetPasskey?: true };

/** `redirect` throws, so it stays outside any try/catch. */
export async function completeFaceIdSignIn(response: AuthenticationResponseJSON): Promise<FaceIdSignInFailure> {
  const challengeId = await takeChallenge(SIGN_IN_COOKIE);
  if (!challengeId) return { error: SIGN_IN_FAILED };
  const result = await finishSignIn(challengeId, response);
  if ("failed" in result) {
    return result.failed === "unknown-passkey" ? { error: SIGN_IN_FAILED, forgetPasskey: true } : { error: SIGN_IN_FAILED };
  }
  await createSession(result.email);
  redirect("/admin");
}

export async function removeFaceIdDevice(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (typeof id !== "string" || !id) return;
  await removePasskey(admin.email, id);
  revalidatePath("/admin/settings");
}
