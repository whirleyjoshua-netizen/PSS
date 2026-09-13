import { NextResponse, type NextRequest } from "next/server";
import { findReferrer } from "@/lib/referrals/db";
import { REF_COOKIE, REF_COOKIE_SECONDS } from "@/lib/referrals/codes";

/**
 * A customer's personal referral link. Remembers the code for 30 days, so a
 * friend who browses first and books later is still attributed, then opens
 * the consultation form. An unknown code quietly opens the plain form.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await findReferrer(code).catch((error) => {
    console.error("Referral lookup failed", error);
    return null;
  });

  const contact = new URL("/contact", request.url);
  if (!referrer) return NextResponse.redirect(contact);

  contact.searchParams.set("ref", "friend");
  contact.searchParams.set("r", referrer.code);
  contact.searchParams.set("by", referrer.firstName);

  const response = NextResponse.redirect(contact);
  response.cookies.set(REF_COOKIE, referrer.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REF_COOKIE_SECONDS,
  });
  return response;
}
