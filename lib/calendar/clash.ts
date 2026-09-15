type TimedItem = { allDay: boolean; start: Date | null; end: Date | null };

/** When an item ends: its own end, or `minutes` after its start when it has none. Null for all-day or startless items. */
export function effectiveEnd(item: TimedItem, minutes = 60): Date | null {
  if (item.allDay || !item.start) return null;
  return item.end ?? new Date(item.start.getTime() + minutes * 60_000);
}

/** Whether `item` overlaps [slotStart, slotStart + minutes). Touching edges is not a clash. */
export function clashes(item: TimedItem, slotStart: Date, minutes = 60): boolean {
  const itemEnd = effectiveEnd(item);
  if (!itemEnd || !item.start) return false;
  const slotEnd = new Date(slotStart.getTime() + minutes * 60_000);
  return item.start.getTime() < slotEnd.getTime() && itemEnd.getTime() > slotStart.getTime();
}
