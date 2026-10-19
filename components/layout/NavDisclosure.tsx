"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * One desktop-header dropdown, as a disclosure: a button that says whether its panel is open (aria-expanded,
 * aria-controls) and a panel that is `hidden` while closed, so closed menus are out of the tab order and the
 * accessibility tree, and open ones are fully in it.
 *
 * - Hover opens it, as the old CSS-only menus did, and leaving closes it unless a click or key opened it.
 * - Click, Enter or Space toggles it (they are a button's own click).
 * - Escape closes it and returns focus to the button.
 * - A click outside, focus moving out, or a new page (usePathname) closes it.
 *
 * The label is the button, not a link: the panel's first item links the label's own page, so the header never
 * shows two links to one URL side by side. The panel's links are server-rendered children, so they stay in the
 * HTML for crawlers whether the panel is open or not.
 */
export function NavDisclosure({
  label,
  className,
  panelClassName,
  children,
}: {
  label: string;
  /** The top-level label's look: the same classes the plain top-level links use. */
  className: string;
  /** Position and width of the panel, e.g. "left-0 w-64". */
  panelClassName: string;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLLIElement>(null);
  // `at` is the page the menu was opened on: a different page means the visitor navigated, so it shows closed.
  const [state, setState] = useState<{ open: boolean; pinned: boolean; at: string | null }>({
    open: false,
    pinned: false,
    at: null,
  });
  const open = state.open && state.at === pathname;
  // A new page clears the menu outright (adjusting state during render, not in an effect), so a menu pinned
  // before the visitor left can't reopen when they come back to the page it was opened on.
  if (state.at !== null && state.at !== pathname) setState({ open: false, pinned: false, at: null });

  const close = () => setState({ open: false, pinned: false, at: null });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <li
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setState((s) => (s.open && s.at === pathname ? s : { open: true, pinned: false, at: pathname }))}
      onMouseLeave={() => setState((s) => (s.pinned ? s : { open: false, pinned: false, at: null }))}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={className}
        onClick={() =>
          setState((s) => {
            const shown = s.open && s.at === pathname;
            // Opened by hover: the click keeps it open rather than snapping it shut under the pointer.
            if (shown && !s.pinned) return { ...s, pinned: true };
            return shown ? { open: false, pinned: false, at: null } : { open: true, pinned: true, at: pathname };
          })
        }
      >
        {label}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={`absolute top-full z-10 border border-rule bg-ivory py-2 shadow-lg ${panelClassName}`}
      >
        {children}
      </div>
    </li>
  );
}
