"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

type TabKey = "photos" | "documents";

// Whether this component is running in a browser at all. The server snapshot is false,
// so the tab strip is absent from the HTML and appears only once React has hydrated —
// which is exactly when a tab can be pressed.
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

/**
 * Photos and documents as real tabs — and, with JavaScript off, as two plain
 * sections with both panels on the page. The tab strip is progressive: it only
 * appears once this component has mounted, so nothing can be hidden behind a
 * button that cannot be pressed. Same precedent as the admin's <details> fallbacks.
 */
export function FilesTabs({ photos, documents }: { photos: ReactNode; documents: ReactNode }) {
  const hydrated = useHydrated();
  const [active, setActive] = useState<TabKey>("photos");
  const id = useId();

  const tabs: { key: TabKey; label: string; panel: ReactNode }[] = [
    { key: "photos", label: "Photos", panel: photos },
    { key: "documents", label: "Documents", panel: documents },
  ];

  // Complete literal class names — Tailwind cannot see a class built at runtime.
  const selected = "min-h-11 border-b-2 border-charcoal px-4 font-display text-xs uppercase tracking-[0.2em] text-charcoal";
  const unselected = "min-h-11 border-b-2 border-transparent px-4 font-display text-xs uppercase tracking-[0.2em] text-ink-soft hover:text-charcoal";

  const move = (from: TabKey, step: number) => {
    const next = tabs[(tabs.findIndex((tab) => tab.key === from) + step + tabs.length) % tabs.length];
    setActive(next.key);
    document.getElementById(`${id}-${next.key}-tab`)?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      {hydrated ? (
        <div role="tablist" aria-label="Photos and documents" className="flex border-b border-rule">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              id={`${id}-${tab.key}-tab`}
              type="button"
              role="tab"
              aria-selected={active === tab.key}
              aria-controls={`${id}-${tab.key}`}
              tabIndex={active === tab.key ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") move(tab.key, 1);
                if (event.key === "ArrowLeft") move(tab.key, -1);
              }}
              className={active === tab.key ? selected : unselected}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`${id}-${tab.key}`}
          role={hydrated ? "tabpanel" : undefined}
          aria-labelledby={hydrated ? `${id}-${tab.key}-tab` : undefined}
          hidden={hydrated && active !== tab.key}
          className="flex flex-col gap-4"
        >
          {hydrated ? null : (
            <h3 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">{tab.label}</h3>
          )}
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
