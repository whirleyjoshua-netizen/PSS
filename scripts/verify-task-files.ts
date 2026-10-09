/**
 * Behavioural proof of files on tasks: migration 043, lib/admin/task-files.ts, and the task_files parts of
 * createTask, deleteTask, listTasks/getTask (file_count) and listResources (task_count).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no suite, and CI does not
 * execute it. If you change that SQL or migration 043, run it yourself — and if you cannot, say the
 * task file rules are unverified rather than assuming they hold. The unit tests mock the database, so
 * they pin the SQL's text only: whether one statement really writes a task and its files, whether a
 * sibling CTE really sees the files a cascade deletes, and whether the checks really refuse a bad row
 * are things only the database can answer. This calls the real functions — no mocks.
 *
 * What it does, against a throwaway database, with ADMIN_EMAILS set to one fake owner:
 *   1. migration 043 applies twice;
 *   2. the database refuses a row of both kinds, of neither, an untrimmed name, a 0-byte or 200 MB+ file,
 *      a second row for one stored file, and a second link of one Resources file to one task;
 *   3. createTask writes the task, an upload and a Resources link in one statement, and names them;
 *      listTaskFiles shows both (the link with the library's name and size); file_count is 2;
 *   4. a repeat submit of the same id answers created: false and writes nothing more;
 *   5. a refused assignee writes neither the task nor its files; a deleted Resources id throws 23503
 *      and writes neither;
 *   6. addTaskUpload / linkResource: added, then exists; 23503 for a missing task or file;
 *   7. recordedPathnames answers only recorded paths;
 *   8. listResources counts the tasks linking each file; deleting the file removes its links;
 *   9. removeTaskFile: a link answers no path and leaves the Resources file; an upload answers its path;
 *  10. deleteTask answers the remaining uploads' paths, and the cascade removes every file row.
 * Then it deletes its rows, so repeated runs leave no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. It takes its connection from
 * E2E_POSTGRES_URL alone and refuses to start if that URL looks like production (ep-cold-term).
 * Run the migrations on that branch first (scripts/migrate.mjs), then:
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-task-files.config.mts --disableConsoleIntercept
 *
 * To watch it fail, one at a time:
 *   - in createTask, change `from ins, jsonb_to_recordset` to `from jsonb_to_recordset` — step 5 "a refused
 *     assignee writes no files" must fail;
 *   - in deleteTask, read the paths after the delete in a second query — step 10 must fail.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";

const FORBIDDEN_HOSTS = ["ep-cold-term"];
function refuse(reason: string): never {
  console.error(`\n================ verify-task-files REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-task-files refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script WRITES rows: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
for (const forbidden of FORBIDDEN_HOSTS) if (host.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at production (${forbidden}).`);
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const OWNER = "verify-task-files@example.com";
process.env.ADMIN_EMAILS = OWNER;

const { createCategory, createResource, deleteResource, listResources } = await import("../lib/admin/resources");
const { addTaskUpload, linkResource, listTaskFiles, recordedPathnames, removeTaskFile } = await import("../lib/admin/task-files");
const { createTask, deleteTask, getTask, listTasks } = await import("../lib/admin/tasks");
const { taskFilePathname } = await import("../lib/admin/task-file-rules");
const { taskInputSchema } = await import("../lib/admin/task-schema");

const sql = neon(url);
const STAMP = Date.now();
const CATEGORY = `VERIFY ${STAMP}`;
const STRANGER = "stranger@example.com";

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throwsWith(run: () => Promise<unknown>): Promise<{ message: string; code?: string } | null> {
  try { await run(); return null; } catch (error) {
    return { message: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code };
  }
}
async function apply(file: string) {
  const statements = readFileSync(`db/migrations/${file}`, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
const input = (over: Record<string, string> = {}) =>
  taskInputSchema.parse({ title: `VERIFY task files ${STAMP}`, notes: "", assignee: OWNER, dueOn: "", status: "todo", ...over });
const uploadFor = (taskId: string, name = "Headlines.pdf") => {
  const id = randomUUID();
  return { id, name, contentType: "application/pdf", sizeBytes: 900, pathname: taskFilePathname(taskId, id, name) };
};
const fileRows = async (taskId: string) => Number((await sql`select count(*)::int as n from task_files where task_id = ${taskId}`)[0].n);

test("files on tasks against a real database", async () => {
  console.log(`\nverify-task-files: writing to ${host}\n`);
  const resourceIds: string[] = [];
  try {
    // 1.
    await apply("043_task_files.sql");
    await apply("043_task_files.sql");
    check(true, "migration 043 applies, and re-applies", "");

    // Two Resources files to link.
    await createCategory(CATEGORY);
    const guide = randomUUID(); const w9 = randomUUID(); resourceIds.push(guide, w9);
    await createResource({ id: guide, name: "Price guide.pdf", category: CATEGORY, contentType: "application/pdf", sizeBytes: 5000, pathname: `resources/${guide}/Price-guide.pdf`, uploadedBy: OWNER });
    await createResource({ id: w9, name: "W-9.pdf", category: CATEGORY, contentType: "application/pdf", sizeBytes: 700, pathname: `resources/${w9}/W-9.pdf`, uploadedBy: OWNER });

    // 3. One statement: the task, an upload and a link.
    const task = randomUUID();
    const headlines = uploadFor(task);
    const made = await createTask(input({ notes: "Go over these" }), OWNER, { id: task, uploads: [headlines], resourceIds: [guide] });
    check(JSON.stringify(made) === JSON.stringify({ id: task, created: true, fileNames: ["Headlines.pdf", "Price guide.pdf"] }),
      "createTask writes the task with its upload and link, and names them", JSON.stringify(made));
    const files = await listTaskFiles(task);
    const link = files.find((f) => f.resourceId === guide);
    const up = files.find((f) => f.id === headlines.id);
    check(files.length === 2 && up?.sizeBytes === 900 && up.addedBy === OWNER && link?.name === "Price guide.pdf" && link.sizeBytes === 5000,
      "listTaskFiles shows the upload and the link with the library's name and size", JSON.stringify(files));
    check((await getTask(task))?.fileCount === 2, "getTask counts 2 files", JSON.stringify(await getTask(task)));
    check((await listTasks()).find((t) => t.id === task)?.fileCount === 2, "listTasks counts 2 files", "");

    // 2. The database's own guards.
    const raw = (over: Record<string, unknown>) => {
      const r = { id: randomUUID(), resource_id: null, name: "x.pdf", content_type: "application/pdf", size_bytes: 1, blob_pathname: `task-files/${randomUUID()}`, ...over };
      return sql`insert into task_files (id, task_id, resource_id, name, content_type, size_bytes, blob_pathname, added_by)
        values (${r.id}, ${task}, ${r.resource_id}, ${r.name}, ${r.content_type}, ${r.size_bytes}, ${r.blob_pathname}, ${OWNER})`;
    };
    const cases: [string, () => Promise<unknown>, string][] = [
      ["a row of both kinds", () => raw({ resource_id: w9 }), "task_files_kind_check"],
      ["a row of neither kind", () => raw({ name: null, content_type: null, size_bytes: null, blob_pathname: null }), "task_files_kind_check"],
      ["an upload missing its path", () => raw({ blob_pathname: null }), "task_files_kind_check"],
      ["an untrimmed name", () => raw({ name: " x.pdf" }), "task_files_name_check"],
      ["a 0-byte file", () => raw({ size_bytes: 0 }), "task_files_size_check"],
      ["a file over 200 MB", () => raw({ size_bytes: 209715201 }), "task_files_size_check"],
      ["a second row for one stored file", () => raw({ blob_pathname: headlines.pathname }), "task_files_blob_idx"],
      ["a second link of one Resources file", () => raw({ resource_id: guide, name: null, content_type: null, size_bytes: null, blob_pathname: null }), "task_files_task_resource_idx"],
    ];
    for (const [what, run, constraint] of cases) {
      const failure = await throwsWith(run);
      check(failure?.message.includes(constraint) ?? false, `the database refuses ${what} (${constraint})`, `got ${failure?.message}`);
    }

    // 4. A repeat submit.
    const again = await createTask(input({ title: "changed" }), OWNER, { id: task, uploads: [uploadFor(task, "Other.pdf")], resourceIds: [w9] });
    check(JSON.stringify(again) === JSON.stringify({ id: task, created: false, fileNames: [] }), "a repeat submit answers created: false", JSON.stringify(again));
    check((await fileRows(task)) === 2 && (await getTask(task))?.title === `VERIFY task files ${STAMP}`, "and writes nothing more", "");

    // 5. Nothing is written when the task isn't.
    const refusedId = randomUUID();
    const refused = await createTask(input({ assignee: STRANGER }), OWNER, { id: refusedId, uploads: [uploadFor(refusedId)], resourceIds: [w9] });
    check(refused === "not-assignable" && (await getTask(refusedId)) === null, "a refused assignee writes no task", JSON.stringify(refused));
    check((await fileRows(refusedId)) === 0, "a refused assignee writes no files", "");
    const goneId = randomUUID();
    const gone = await throwsWith(() => createTask(input(), OWNER, { id: goneId, uploads: [uploadFor(goneId)], resourceIds: [randomUUID()] }));
    check(gone?.code === "23503", "a deleted Resources id throws 23503", JSON.stringify(gone));
    check((await getTask(goneId)) === null && (await fileRows(goneId)) === 0, "and writes neither the task nor its upload", "");

    // 6.
    const second = uploadFor(task, "Descriptions.pdf");
    check((await addTaskUpload(task, second, OWNER)) === "added", "addTaskUpload records an upload", "");
    check((await addTaskUpload(task, second, OWNER)) === "exists", "a repeat save answers exists", "");
    check((await linkResource(task, guide, OWNER)) === "exists", "linking a linked file answers exists", "");
    check((await linkResource(task, w9, OWNER)) === "added", "linkResource links another", "");
    const missingTask = randomUUID();
    check((await throwsWith(() => addTaskUpload(missingTask, uploadFor(missingTask), OWNER)))?.code === "23503", "addTaskUpload to a missing task throws 23503", "");
    check((await throwsWith(() => linkResource(task, randomUUID(), OWNER)))?.code === "23503", "linking a missing Resources file throws 23503", "");

    // 7.
    const recorded = await recordedPathnames([headlines.pathname, `task-files/${task}/${randomUUID()}/nope.pdf`]);
    check(recorded.size === 1 && recorded.has(headlines.pathname), "recordedPathnames answers only recorded paths", JSON.stringify([...recorded]));

    // 8. Another task links the guide too.
    const other = randomUUID();
    await createTask(input(), OWNER, { id: other, uploads: [], resourceIds: [guide] });
    const counts = (await listResources()).filter((r) => resourceIds.includes(r.id)).map((r) => [r.name, r.taskCount]);
    check(JSON.stringify(counts) === JSON.stringify([["Price guide.pdf", 2], ["W-9.pdf", 1]]), "listResources counts the tasks linking each file", JSON.stringify(counts));
    await deleteResource(w9);
    check(!(await listTaskFiles(task)).some((f) => f.resourceId === w9), "deleting a Resources file removes its links", "");

    // 9.
    const linkRow = (await listTaskFiles(task)).find((f) => f.resourceId === guide)!;
    check(JSON.stringify(await removeTaskFile(task, linkRow.id)) === JSON.stringify({ pathname: null }), "removing a link answers no path", "");
    check((await listResources()).some((r) => r.id === guide), "and the file stays in Resources", "");
    check((await removeTaskFile(other, second.id)) === null, "another task can't remove this task's file", "");
    check(JSON.stringify(await removeTaskFile(task, second.id)) === JSON.stringify({ pathname: second.pathname }), "removing an upload answers its path", "");
    check((await removeTaskFile(task, second.id)) === null, "a second removal answers null", "");

    // 10.
    const paths = await deleteTask(task);
    check(JSON.stringify(paths) === JSON.stringify([headlines.pathname]), "deleteTask answers the remaining upload's path", JSON.stringify(paths));
    check((await fileRows(task)) === 0, "and the cascade removes every file row", "");
    check((await deleteTask(task)) === null, "a second delete answers null", "");
    check(JSON.stringify(await deleteTask(other)) === "[]", "a task with only links answers no paths", "");
  } finally {
    await sql`delete from tasks where created_by = ${OWNER}`;
    await sql`delete from company_files where id = any(${resourceIds}::uuid[])`;
    await sql`delete from resource_categories where name = ${CATEGORY}`;
    const left = await sql`select count(*)::int as n from task_files where added_by = ${OWNER}`;
    console.log(`cleanup: ${left[0].n} task file rows left`);
  }
});
