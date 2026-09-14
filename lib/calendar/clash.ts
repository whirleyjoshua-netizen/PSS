/** Whether `item` overlaps [slotStart, slotStart + minutes). Touching edges is not a clash. */
export function clashes(item: { allDay: boolean; start: Date | null; end: Date | null }, slotStart: Date, minutes = 60): boolean {
  if (item.allDay || !item.start) return false;
  const slotEnd = new Date(slotStart.getTime() + minutes * 60_000);
  const itemEnd = item.end ?? new Date(item.start.getTime() + 60 * 60_000);
  return item.start.getTime() < slotEnd.getTime() && itemEnd.getTime() > slotStart.getTime();
}
