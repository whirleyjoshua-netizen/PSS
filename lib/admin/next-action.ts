/** The Overview in edit mode, optionally scrolled to one field of the details form. */
export const editDetailsHref = (jobId: string, anchor?: string): string =>
  `/admin/jobs/${jobId}?tab=overview&edit=details${anchor ? `#${anchor}` : ""}`;
