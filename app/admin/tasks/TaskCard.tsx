import Link from "next/link";
import { SubmitOnChange } from "@/app/admin/SubmitOnChange";
import { displayName, dueLine, dueState, TASK_STATUSES, type DueState, type Task } from "@/lib/admin/task-rules";
import { formatShortDate, formatWhen } from "@/lib/admin/time";
import { moveTaskAction } from "./actions";
import { RemindButton } from "./RemindButton";

// Stage colors are edges only (they fail contrast as text); the words carry the meaning.
const EDGE: Record<DueState, string> = {
  none: "border-l-rule", upcoming: "border-l-rule", today: "border-l-stage-new", overdue: "border-l-overdue",
};
const DUE_TEXT: Record<DueState, string> = {
  none: "text-ink-soft", upcoming: "text-ink-soft", today: "font-semibold", overdue: "font-semibold text-overdue",
};

/** `today` is the Las Vegas date. */
export function TaskCard({ task, today }: { task: Task; today: string }) {
  const open = task.status !== "done";
  const due = open ? dueState(task.dueOn, today) : "none";
  return (
    <article aria-labelledby={`task-${task.id}`} className={`flex flex-col gap-2 border border-l-4 border-rule bg-ivory p-3 text-sm ${EDGE[due]}`}>
      <Link id={`task-${task.id}`} href={`/admin/tasks/${task.id}`} className="font-semibold underline-offset-4 hover:underline">
        {task.title}
      </Link>
      <p className="text-ink-soft">{task.assigneeEmail ? displayName(task.assigneeEmail) : "Unassigned"}</p>
      {open && task.dueOn ? <p className={DUE_TEXT[due]}>{dueLine(task.dueOn, today)}</p> : null}
      {!open && task.completedAt ? <p className="text-ink-soft">Done {formatShortDate(task.completedAt)}</p> : null}
      {task.fileCount > 0 ? (
        <p className="text-ink-soft"><span aria-hidden="true">📎 </span>{task.fileCount === 1 ? "1 file" : `${task.fileCount} files`}</p>
      ) : null}
      <form action={moveTaskAction.bind(null, task.id)} className="flex items-center gap-2">
        <label htmlFor={`status-${task.id}`} className="sr-only">{`Status of ${task.title}`}</label>
        <SubmitOnChange id={`status-${task.id}`} name="status" defaultValue={task.status}>
          {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </SubmitOnChange>
        <noscript><button type="submit" className="min-h-11 px-3 underline">Move</button></noscript>
      </form>
      {open && task.assigneeEmail ? <RemindButton taskId={task.id} title={task.title} /> : null}
      {task.lastRemindedAt ? <p className="text-xs text-ink-soft">{`Reminded ${formatWhen(task.lastRemindedAt)}`}</p> : null}
    </article>
  );
}
