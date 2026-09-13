"use server";

import { redirect } from "next/navigation";
import { destroyCustomerSession } from "@/lib/portal/session";

export async function signOutCustomer(): Promise<void> {
  await destroyCustomerSession();
  redirect("/project/sign-in");
}
