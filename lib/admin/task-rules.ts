/** The task board's rules. Pure and safe to import from client components. */

export const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  TASK_STATUSES.some((status) => status.value === value);

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;
/** Remind now refuses inside this window; the SQL in lib/admin/tasks.ts enforces it. */
export const REMIND_COOLDOWN_MINUTES = 10;
/** Done tasks leave the board this long after they were finished. */
export const DONE_VISIBLE_DAYS = 14;

/** `dueOn` is a Las Vegas calendar day, "YYYY-MM-DD". */
export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  assigneeEmail: string | null;
  dueOn: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  lastRemindedAt: Date | null;
  lastRemindedBy: string | null;
};

/** What an email about a task needs. */
export type TaskSummary = Pick<Task, "id" | "title" | "notes" | "dueOn" | "assigneeEmail">;

/** "joshua.whirley@…" → "Joshua Whirley". Sign-ins have no name, only an email. */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1));
  return words.join(" ") || email;
}

const DAY_MS = 86_400_000;
/** Noon UTC on a YYYY-MM-DD date, so day arithmetic never crosses a boundary. */
const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const daysFrom = (from: string, to: string) => Math.round((noonUtc(to).getTime() - noonUtc(from).getTime()) / DAY_MS);

export const addDays = (ymd: string, days: number): string =>
  new Date(noonUtc(ymd).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export type DueState = "none" | "overdue" | "today" | "upcoming";

/** `today` is the Las Vegas date (lasVegasDate(now)). */
export function dueState(dueOn: string | null, today: string): DueState {
  if (!dueOn) return "none";
  if (dueOn < today) return "overdue";
  return dueOn === today ? "today" : "upcoming";
}

/** "Fri, Oct 9", with no time-zone shift. */
export const formatDueDay = (ymd: string): string =>
  noonUtc(ymd).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

export function dueLine(dueOn: string | null, today: string): string {
  if (!dueOn) return "No due date";
  const late = daysFrom(dueOn, today);
  if (late === 0) return "Due today";
  if (late > 0) return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
  return `Due ${formatDueDay(dueOn)}`;
}

/** Undated last; equal dates oldest first. Overdue tasks sort first because their dates are earliest. */
function byDue(a: Task, b: Task): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function boardColumns(tasks: Task[], now: Date): Record<TaskStatus, Task[]> {
  const cutoff = now.getTime() - DONE_VISIBLE_DAYS * DAY_MS;
  return {
    todo: tasks.filter((task) => task.status === "todo").sort(byDue),
    doing: tasks.filter((task) => task.status === "doing").sort(byDue),
    done: tasks
      .filter((task) => task.status === "done" && task.completedAt !== null && task.completedAt.getTime() >= cutoff)
      .sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime()),
  };
}
