"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/admin/session";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/admin/sign-in");
}
