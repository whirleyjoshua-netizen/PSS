"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/admin/resource-rules";
import { displayName } from "@/lib/admin/task-rules";
import { formatWhen } from "@/lib/admin/time";
import type { ResourceOption, TaskFile } from "@/lib/admin/task-file-rules";
import { linkResourceAction, removeTaskFileAction, saveTaskFileAction, type TaskFileResult } from "./file-actions";
import { FilePicker } from "./FilePicker";

const BUTTON = "min-h-11 px-3 text-sm underline underline-offset-4";
const errorOf = (result: TaskFileResult) => ("error" in result ? result.error : null);

function Row({ file }: { file: TaskFile }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const linked = file.resourceId !== null;
  const remove = () => start(async () => {
    let result: TaskFileResult;
    try {
      result = await removeTaskFileAction(file.taskId, file.id);
    } catch {
      result = { error: "That didn't save. Try again." };
    }
    setError(errorOf(result));
    if ("error" in result) return;
    setConfirming(false);
    router.refresh();
  });

  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a href={`/admin/tasks/files/${file.id}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4 break-all">{file.name}</a>
        <span className="text-sm text-ink-soft">
          {[formatBytes(file.sizeBytes), linked ? "From Resources" : null, `${displayName(file.addedBy)}, ${formatWhen(file.createdAt)}`].filter(Boolean).join(" · ")}
        </span>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{linked ? `Remove ${file.name} from this task? It stays in Resources.` : `Remove ${file.name}? This deletes the file.`}</span>
          <button type="button" autoFocus disabled={pending} className={`${BUTTON} text-red-700`} onClick={remove}>Yes, remove</button>
          <button type="button" disabled={pending} className={BUTTON} onClick={() => setConfirming(false)}>No</button>
        </div>
      ) : (
        <div>
          <button type="button" className={BUTTON} aria-label={`Remove ${file.name}`} onClick={() => setConfirming(true)}>Remove</button>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </li>
  );
}

/** The task page's Files: what's attached, and the picker. Each file saves as soon as it's uploaded or picked. */
export function TaskFiles({ taskId, files, resources }: { taskId: string; files: TaskFile[]; resources: ResourceOption[] }) {
  const router = useRouter();
  const saved = async (result: Promise<TaskFileResult>) => {
    const error = errorOf(await result);
    if (!error) router.refresh();
    return error;
  };
  return (
    <div className="flex flex-col gap-4">
      {files.length === 0 ? <p className="text-sm text-ink-soft">No files yet.</p> : (
        <ul className="flex flex-col divide-y divide-rule border border-rule">
          {files.map((file) => <Row key={file.id} file={file} />)}
        </ul>
      )}
      <FilePicker
        taskId={taskId}
        resources={resources}
        attachedResourceIds={files.flatMap((file) => (file.resourceId ? [file.resourceId] : []))}
        onUploaded={(upload) => saved(saveTaskFileAction(taskId, upload))}
        onPickResource={(resource) => saved(linkResourceAction(taskId, resource.id))}
        idPrefix={`task-${taskId}-files`}
      />
    </div>
  );
}
