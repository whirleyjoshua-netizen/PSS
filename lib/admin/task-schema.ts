import { z } from "zod";
import { TASK_NOTES_MAX, TASK_STATUSES, TASK_TITLE_MAX, type TaskStatus } from "./task-rules";

const STATUS_VALUES = TASK_STATUSES.map((status) => status.value) as [TaskStatus, ...TaskStatus[]];
const blankToNull = (value: string) => (value === "" ? null : value);

/** A real calendar day: "2026-02-30" parses in JS as March 2, so round-trip it. */
const isCalendarDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** The new-task and edit-task forms. The action passes every field as a string. */
export const taskInputSchema = z.object({
  title: z.string().trim()
    .min(1, "Give the task a title")
    .max(TASK_TITLE_MAX, `Keep the title to ${TASK_TITLE_MAX} characters`),
  notes: z.string().trim()
    .max(TASK_NOTES_MAX, `Keep the notes to ${TASK_NOTES_MAX} characters`)
    .transform(blankToNull),
  assignee: z.string().trim().toLowerCase().transform(blankToNull)
    .pipe(z.string().email("Pick someone from the list").nullable()),
  dueOn: z.string().trim().transform(blankToNull)
    .pipe(z.string().refine(isCalendarDay, "Pick a due date from the calendar").nullable()),
  status: z.enum(STATUS_VALUES),
});

export type TaskInput = z.output<typeof taskInputSchema>;
