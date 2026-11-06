import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";
import { productName } from "@/lib/dc/contract-layout";

/**
 * One line of what the client bought, for their project page (owner 2026-11-05). Deliberately room,
 * product and quantity only: the query reads no other column, so no cost, price or option can reach the page.
 */
export type OrderLine = { room: string; product: string; qty: number };

/** The lines of the job's signed Direct Connect version, in quote order, named as the quote PDF names them. */
export async function signedOrder(versionId: string): Promise<OrderLine[]> {
  if (!isUuid(versionId)) return [];
  const rows = await db()`
    select room, description, qty from dc_quote_lines where version_id = ${versionId} order by position`;
  return rows.map((row) => ({
    room: (row.room as string) || "Accessory",
    product: productName(row.description as string),
    qty: Number(row.qty),
  }));
}
