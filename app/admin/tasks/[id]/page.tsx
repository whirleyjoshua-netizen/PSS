import Link from "next/link";
import { notFound } from "next/navigation";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { DeleteButton } from "@/app/admin/jobs/[id]/DeleteButton";
import { requireAdmin } from "@/lib/admin/session";
import { assignableEmails, getTask } from "@/lib/admin/tasks";
import { displayName } from "@/lib/admin/task-rules";
import { formatWhen } from "@/lib/admin/time";
import { deleteTaskAction, updateTaskAction } from "../actions";
import { RemindButton } from "../RemindButton";
import { TaskForm } from "../TaskForm";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [task, people] = await Promise.all([getTask(id), assignableEmails()]);
  if (!task) notFound();
  // A done task keeps the name of someone who has since lost access; the list must show it,
  // or the select would silently fall back to Unassigned and saving would erase it.
  const noAccess = task.assigneeEmail && !people.includes(task.assigneeEmail) ? task.assigneeEmail : undefined;
  const options = noAccess ? [...people, noAccess] : people;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/admin/tasks" className={TEXT_LINK}>All tasks</Link>
      <h1 className="text-2xl font-semibold">{task.title}</h1>
      <p className="text-sm text-ink-soft">
        {`Created by ${displayName(task.createdBy)}, ${formatWhen(task.createdAt)}`}
        {task.lastRemindedAt && task.lastRemindedBy
          ? ` · Last reminded ${formatWhen(task.lastRemindedAt)} by ${displayName(task.lastRemindedBy)}`
          : ""}
      </p>
      {task.status !== "done" && task.assigneeEmail ? <RemindButton taskId={task.id} title={task.title} /> : null}
      <TaskForm
        action={updateTaskAction.bind(null, task.id)}
        people={options}
        noAccess={noAccess}
        defaults={{
          title: task.title, notes: task.notes ?? "", assignee: task.assigneeEmail ?? "",
          dueOn: task.dueOn ?? "", status: task.status,
        }}
        submitLabel="Save"
        idPrefix="edit-task"
        showStatus
      />
      <form action={deleteTaskAction.bind(null, task.id)}>
        <DeleteButton />
      </form>
    </div>
  );
}
