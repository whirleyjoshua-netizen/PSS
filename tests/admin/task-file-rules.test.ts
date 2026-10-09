import { describe, expect, it } from "vitest";
import { parseTaskFilePathname, taskFilePathname } from "@/lib/admin/task-file-rules";

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

describe("task file paths", () => {
  it("stores an upload under its task and its own id, with a storage-safe name", () => {
    const path = taskFilePathname(TASK, FILE, "Google headlines (v2).pdf");
    expect(path).toBe(`task-files/${TASK}/${FILE}/Google-headlines-v2-.pdf`);
    expect(parseTaskFilePathname(path)).toEqual({ taskId: TASK, fileId: FILE });
  });

  it("never names a file . or ..", () => {
    expect(taskFilePathname(TASK, FILE, "..")).toBe(`task-files/${TASK}/${FILE}/file`);
  });

  it("refuses any path it didn't make", () => {
    for (const bad of [
      `resources/${FILE}/a.pdf`,
      `task-files/${TASK}/a.pdf`,
      `task-files/${TASK}/${FILE}/..`,
      `task-files/${TASK}/${FILE}/a/b.pdf`,
      `task-files/not-a-uuid/${FILE}/a.pdf`,
      `task-files/${TASK}/${FILE}/a b.pdf`,
      `/task-files/${TASK}/${FILE}/a.pdf`,
    ]) expect(parseTaskFilePathname(bad)).toBeNull();
  });
});
