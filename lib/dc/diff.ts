import type { StoredLine } from "./store";

export type LineChange =
  | { kind: "added"; position: number; description: string }
  | { kind: "removed"; position: number; description: string }
  | { kind: "changed"; position: number; description: string; fromMsrpCents: number; toMsrpCents: number; fromQty: number; toQty: number };

/** Lines are matched by position, the item number DC prints. Price and qty changes are reported; option-only edits show as unchanged. */
export function diffLines(older: StoredLine[], newer: StoredLine[]): LineChange[] {
  const before = new Map(older.map((l) => [l.position, l]));
  const after = new Map(newer.map((l) => [l.position, l]));
  const changes: LineChange[] = [];
  for (const [position, l] of after) {
    const o = before.get(position);
    if (!o) changes.push({ kind: "added", position, description: l.description });
    else if (o.msrpUnitCents !== l.msrpUnitCents || o.qty !== l.qty || o.description !== l.description) {
      changes.push({ kind: "changed", position, description: l.description, fromMsrpCents: o.msrpUnitCents, toMsrpCents: l.msrpUnitCents, fromQty: o.qty, toQty: l.qty });
    }
  }
  for (const [position, o] of before) if (!after.has(position)) changes.push({ kind: "removed", position, description: o.description });
  return changes.sort((a, b) => a.position - b.position);
}
