export type DayScheduleItem = { key: string; allDay: boolean; start: string | null; end: string | null; title: string };
export type DayScheduleResult =
  | { ok: true; items: DayScheduleItem[]; notice: string | null }
  | { ok: false };
