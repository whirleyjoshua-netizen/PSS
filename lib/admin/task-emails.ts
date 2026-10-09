import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "./origin";
import { formatDay, lasVegasDate } from "./time";
import { addDays, displayName, dueLine, formatDueDay, type Task, type TaskSummary } from "./task-rules";
import { listDigestTasks } from "./tasks";

export type Email = { subject: string; text: string };

export const taskUrl = (id: string): string => `${adminOrigin()}/admin/tasks/${id}`;

/** Files are named, not attached: they open from the task, behind sign-in. */
const body = (first: string, task: TaskSummary): string =>
  [
    first,
    ...(task.notes ? ["", task.notes] : []),
    ...(task.fileNames.length > 0 ? ["", "Files:", ...task.fileNames.map((name) => `- ${name}`)] : []),
    "", `Open the task: ${taskUrl(task.id)}`,
  ].join("\n");

export function assignmentEmail(task: TaskSummary, actor: string): Email {
  return {
    subject: `${displayName(actor)} assigned you: ${task.title}`,
    text: body(task.dueOn ? `Due ${formatDueDay(task.dueOn)}` : "No due date", task),
  };
}

export function reminderEmail(task: TaskSummary, actor: string, now: Date): Email {
  return {
    subject: `Reminder from ${displayName(actor)}: ${task.title}`,
    text: body(dueLine(task.dueOn, lasVegasDate(now)), task),
  };
}

/** One email per assignee with something overdue, due today or due tomorrow; nobody else. */
export function digestEmails(tasks: Task[], now: Date): { to: string; email: Email }[] {
  const today = lasVegasDate(now);
  const tomorrow = addDays(today, 1);
  const byPerson = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.assigneeEmail || !task.dueOn || task.status === "done" || task.dueOn > tomorrow) continue;
    byPerson.set(task.assigneeEmail, [...(byPerson.get(task.assigneeEmail) ?? []), task]);
  }
  const section = (title: string, list: Task[], withDue: boolean): string[] =>
    list.length === 0 ? [] : [title, ...list.flatMap((task) => [
      `- ${task.title}${withDue ? ` · ${dueLine(task.dueOn, today)}` : ""}`,
      `  ${taskUrl(task.id)}`,
    ])];
  return [...byPerson.keys()].sort().map((to) => {
    const mine = byPerson.get(to) as Task[];
    const sections = [
      section("Overdue", mine.filter((task) => (task.dueOn as string) < today), true),
      section("Due today", mine.filter((task) => task.dueOn === today), false),
      section("Due tomorrow", mine.filter((task) => task.dueOn === tomorrow), false),
    ].filter((lines) => lines.length > 0);
    return {
      to,
      email: { subject: `Your tasks for ${formatDay(now)}: ${mine.length}`, text: sections.map((lines) => lines.join("\n")).join("\n\n") },
    };
  });
}

/** True when it went out. Never throws: callers have already saved. */
export async function sendTaskEmail(to: string, email: Email, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) {
    console.error("Task email is not configured (missing RESEND_API_KEY).");
    return false;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("Task email failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Task email failed", error);
    return false;
  }
}

/** Run by the daily cron. One person's failed send does not stop the rest. */
export async function sendTaskDigest(now: Date = new Date()): Promise<{ sent: number; failed: number; error?: string }> {
  try {
    const emails = digestEmails(await listDigestTasks(addDays(lasVegasDate(now), 1)), now);
    let sent = 0;
    let failed = 0;
    for (const { to, email } of emails) {
      if (await sendTaskEmail(to, email)) sent += 1;
      else failed += 1;
    }
    if (failed === 0) return { sent, failed };
    return { sent, failed, error: `${failed} task digest ${failed === 1 ? "email" : "emails"} didn't send` };
  } catch (error) {
    console.error("Task digest failed", error);
    return { sent: 0, failed: 0, error: (error as Error).message };
  }
}
