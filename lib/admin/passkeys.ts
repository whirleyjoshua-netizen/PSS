import "server-only";
import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { adminOrigin } from "./origin";
import { displayName } from "./task-rules";
import { newToken } from "./tokens";

/**
 * Face ID sign-in (passkeys). See docs/superpowers/specs/2026-10-01-pss-ops-app-design.md §2b.
 * Registration binds a passkey to a signed-in admin's address. Sign-in uses discoverable
 * credentials, so no address is typed. Every challenge is used once, within 5 minutes, for its
 * purpose (and, for registration, its address) only.
 */

const RP_NAME = "PSS Ops";

/** From configuration, never the request's Host. */
export const expectedOrigin = (): string => adminOrigin();
export const rpId = (): string => new URL(adminOrigin()).hostname;

/** Stable per address, so a phone keeps one PSS Ops passkey per person rather than piling them up. */
const userIdFor = (email: string) => new Uint8Array(createHash("sha256").update(`pss-ops:${email}`).digest());

const looksLikeResponse = (response: unknown): response is { id: string } =>
  typeof response === "object" && response !== null &&
  typeof (response as { id?: unknown }).id === "string" &&
  (response as { id: string }).id.length > 0 && (response as { id: string }).id.length <= 1024;

/** Unauthenticated sign-in challenges waiting at once. Past this, sign-in is refused, not stored. */
export const MAX_WAITING_SIGN_INS = 200;

/**
 * One statement: clears expired challenges and stores this one for 5 minutes. A sign-in challenge
 * is stored only while fewer than MAX_WAITING_SIGN_INS live ones exist (null when refused). The
 * sweep's deletions are not visible inside the same statement, so the count skips expired rows.
 */
async function storeChallenge(purpose: "register" | "sign-in", challenge: string, email: string | null): Promise<string | null> {
  const id = newToken();
  if (purpose === "register") {
    await db()`
      with swept as (
        delete from admin_webauthn_challenges where expires_at < now()
      )
      insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at)
      values (${id}, ${challenge}, 'register', ${email}, now() + interval '5 minutes')`;
    return id;
  }
  const stored = await db()`
    with swept as (
      delete from admin_webauthn_challenges where expires_at < now()
    )
    insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at)
    select ${id}, ${challenge}, 'sign-in', null, now() + interval '5 minutes'
    where (select count(*) from admin_webauthn_challenges where purpose = 'sign-in' and expires_at > now()) < ${MAX_WAITING_SIGN_INS}
    returning id`;
  return stored.length > 0 ? id : null;
}

export async function startRegistration(
  email: string,
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const existing = await db()`select id, transports from admin_passkeys where email = ${email} order by created_at`;
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userID: userIdFor(email),
    userName: email,
    userDisplayName: displayName(email),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.id as string,
      transports: (row.transports as string[] | null) ?? [],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
  });
  const challengeId = (await storeChallenge("register", options.challenge, email)) as string;
  return { options, challengeId };
}

/** True when the passkey was verified and stored for this address. */
export async function finishRegistration(
  email: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  label: string,
): Promise<boolean> {
  if (!challengeId || !looksLikeResponse(response)) return false;
  const used = await db()`
    delete from admin_webauthn_challenges
    where id = ${challengeId} and purpose = 'register' and email = ${email} and expires_at > now()
    returning challenge`;
  const challenge = used[0]?.challenge as string | undefined;
  if (!challenge) return false;

  let credential;
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: true,
    });
    if (!result.verified) return false;
    credential = result.registrationInfo.credential;
  } catch (error) {
    console.error("Face ID registration did not verify", error);
    return false;
  }

  const rows = await db()`
    insert into admin_passkeys (id, email, public_key, counter, transports, label)
    values (${credential.id}, ${email}, decode(${Buffer.from(credential.publicKey).toString("hex")}, 'hex'),
      ${credential.counter}, ${credential.transports ?? []}::text[], ${label})
    on conflict (id) do nothing
    returning id`;
  return rows.length > 0;
}

/** Null when too many sign-ins are already waiting. */
export async function startSignIn(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string } | null> {
  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    allowCredentials: [],
    userVerification: "required",
  });
  const challengeId = await storeChallenge("sign-in", options.challenge, null);
  return challengeId ? { options, challengeId } : null;
}

/**
 * The signed-in address, or why not. "unknown-passkey" means no stored passkey has this id (it was
 * removed), so the phone can stop treating Face ID as on. Every other failure is "not-verified".
 */
export type SignInResult = { email: string } | { failed: "unknown-passkey" | "not-verified" };
const NOT_VERIFIED = { failed: "not-verified" } as const;

export async function finishSignIn(challengeId: string, response: AuthenticationResponseJSON): Promise<SignInResult> {
  if (!challengeId || !looksLikeResponse(response)) return NOT_VERIFIED;
  const sql = db();
  const used = await sql`
    delete from admin_webauthn_challenges
    where id = ${challengeId} and purpose = 'sign-in' and expires_at > now()
    returning challenge`;
  const challenge = used[0]?.challenge as string | undefined;
  if (!challenge) return NOT_VERIFIED;

  const found = await sql`
    select email, encode(public_key, 'hex') as public_key, counter, transports
    from admin_passkeys where id = ${response.id}`;
  const stored = found[0];
  if (!stored) return { failed: "unknown-passkey" };

  let newCounter: number;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      credential: {
        id: response.id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key as string, "hex")),
        counter: Number(stored.counter),
        transports: (stored.transports as string[] | null) ?? [],
      },
      requireUserVerification: true,
    });
    if (!result.verified) return NOT_VERIFIED;
    newCounter = result.authenticationInfo.newCounter;
  } catch (error) {
    console.error("Face ID sign-in did not verify", error);
    return NOT_VERIFIED;
  }

  // The same rule the library applies, repeated in the write so two racing sign-ins with one
  // signature cannot both move the counter. Passkeys that never count (iCloud) stay at 0.
  const moved = await sql`
    update admin_passkeys set counter = ${newCounter}, last_used_at = now()
    where id = ${response.id} and (counter < ${newCounter}::bigint or (counter = 0 and ${newCounter}::bigint = 0))
    returning email`;
  const email = moved[0]?.email as string | undefined;
  return email && (await isAllowed(email)) ? { email } : NOT_VERIFIED;
}

export type PasskeyDevice = { id: string; label: string; createdAt: Date; lastUsedAt: Date | null };

export async function listPasskeys(email: string): Promise<PasskeyDevice[]> {
  const rows = await db()`
    select id, label, created_at, last_used_at from admin_passkeys where email = ${email} order by created_at`;
  return rows.map((row) => ({
    id: row.id as string,
    label: row.label as string,
    createdAt: new Date(row.created_at as string),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : null,
  }));
}

/** Scoped to the address, so nobody can remove someone else's device. */
export async function removePasskey(email: string, id: string): Promise<boolean> {
  const rows = await db()`delete from admin_passkeys where id = ${id} and email = ${email} returning id`;
  return rows.length > 0;
}

/** A plain name for the device, from its user agent. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}
