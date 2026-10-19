"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { isOwner } from "@/lib/admin/allowlist";
import { hashKey, newAgentKey } from "@/lib/agents/rules";
import { deleteColumnKey, setColumnKey } from "@/lib/column/store";

export type ColumnKeyState = { key?: string; error?: string; disconnected?: boolean };

// Column can read every lead's contact details, so only owners can connect it.
const NOT_OWNER = "Only an owner can connect Column.";

/** A new key replaces the old one at once. It's shown once, never stored or logged. */
export async function createColumnKeyAction(_prev: ColumnKeyState, _form: FormData): Promise<ColumnKeyState> {
  const admin = await requireAdmin();
  if (!isOwner(admin.email)) return { error: NOT_OWNER };
  const key = newAgentKey();
  await setColumnKey(hashKey(key), admin.email);
  revalidatePath("/admin/settings");
  return { key };
}

export async function disconnectColumnAction(_prev: ColumnKeyState, _form: FormData): Promise<ColumnKeyState> {
  const admin = await requireAdmin();
  if (!isOwner(admin.email)) return { error: NOT_OWNER };
  await deleteColumnKey();
  revalidatePath("/admin/settings");
  return { disconnected: true };
}
