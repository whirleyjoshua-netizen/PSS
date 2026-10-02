"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Home-screen iPhone apps have no pull-to-refresh; this re-fetches the page's server data. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Refresh"
      disabled={pending}
      onClick={(event) => {
        // Inside the Menu's <summary>: refreshing must not open or close the menu.
        event.preventDefault();
        event.stopPropagation();
        start(() => router.refresh());
      }}
      className="min-h-11 px-3 text-sm text-sidebar-muted"
    >
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
