import { fitWithin, type FileKind } from "./uploads";

/** Shrinks a camera photo to 2000 px on the longest side as a JPEG (also converts HEIC). */
export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, 2000);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read that photo."))), "image/jpeg", 0.8),
  );
}

export async function postFile(
  jobId: string, file: Blob, name: string, kind: FileKind,
): Promise<{ id: string } | { error: string }> {
  const data = new FormData();
  data.append("file", file, name);
  data.append("kind", kind);
  try {
    const response = await fetch(`/admin/jobs/${jobId}/files`, { method: "POST", body: data });
    if (response.status === 413) return { error: "That file is too large to upload." };
    const body = await response.json().catch(() => null);
    if (response.ok && body?.id) return { id: body.id as string };
    return { error: body?.error ?? "Upload failed. Check your signal and try again." };
  } catch {
    return { error: "Upload failed. Check your signal and try again." };
  }
}
