import Link from "next/link";
import { CARD } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { listResources } from "@/lib/admin/resources";
import { assignableEmails, listTasks } from "@/lib/admin/tasks";
import { boardColumns, DONE_VISIBLE_DAYS, TASK_STATUSES, type TaskStatus } from "@/lib/admin/task-rules";
import { lasVegasDate } from "@/lib/admin/time";
import { createTaskAction } from "./actions";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

const EMPTY: Record<TaskStatus, string> = {
  todo: "Nothing waiting.",
  doing: "Nothing in progress.",
  done: `Nothing finished in the last ${DONE_VISIBLE_DAYS} days.`,
};
const TOGGLE = "inline-flex min-h-11 items-center px-4 text-sm border border-charcoal";

/** Spec §4: the board. `?view=mine` keeps the filter in links and bookmarks. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const admin = await requireAdmin();
  const me = admin.email.toLowerCase();
  const [tasks, people, query, library] = await Promise.all([listTasks(), assignableEmails(), searchParams, listResources()]);
  const resources = library.map(({ id, name, category }) => ({ id, name, category }));
  const mine = (Array.isArray(query.view) ? query.view[0] : query.view) === "mine";
  const now = new Date();
  const today = lasVegasDate(now);
  const columns = boardColumns(mine ? tasks.filter((task) => task.assigneeEmail === me) : tasks, now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <nav aria-label="Whose tasks" className="flex">
          <Link href="/admin/tasks" aria-current={mine ? undefined : "page"} className={`${TOGGLE} ${mine ? "" : "bg-charcoal text-ivory"}`}>Everyone</Link>
          <Link href="/admin/tasks?view=mine" aria-current={mine ? "page" : undefined} className={`${TOGGLE} border-l-0 ${mine ? "bg-charcoal text-ivory" : ""}`}>Mine</Link>
        </nav>
      </div>
      <details className={CARD}>
        <summary className="cursor-pointer font-semibold">New task</summary>
        <TaskForm
          action={createTaskAction}
          people={people}
          defaults={{ title: "", notes: "", assignee: people.includes(me) ? me : "", dueOn: "", status: "todo" }}
          submitLabel="Add task"
          idPrefix="new-task"
          newFiles={{ resources }}
        />
      </details>
      <div className="grid gap-6 md:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <section key={status.value} aria-labelledby={`column-${status.value}`} className="flex flex-col gap-3">
            <h2 id={`column-${status.value}`} className="text-lg font-semibold">
              {`${status.label} (${columns[status.value].length})`}
            </h2>
            {columns[status.value].length === 0 ? (
              <p className="text-sm text-ink-soft">{EMPTY[status.value]}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {columns[status.value].map((task) => <li key={task.id}><TaskCard task={task} today={today} /></li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
