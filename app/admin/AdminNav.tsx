"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/admin/icons";
import { signOut } from "./actions";
import { RefreshButton } from "./RefreshButton";

const LINKS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Jobs", icon: "jobs" },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
  { href: "/admin/tasks", label: "Tasks", icon: "check" },
  { href: "/admin/documents", label: "Documents", icon: "document" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

/** A job page, including the new-job form, belongs under Jobs; a template page under Documents. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/jobs/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** "joshua.whirley@…" → "JW"; "owner@…" → "OW". */
export function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase();
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm transition-colors ${
                active
                  ? "border-champagne bg-champagne/15 font-semibold text-sidebar-ink"
                  : "border-transparent text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink"
              }`}
            >
              <Icon name={icon} className="size-5" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Account({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex items-center gap-3 border-t border-sidebar-ink/10 px-3 pt-4">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne text-sm font-semibold text-charcoal">
        {initialsFor(email)}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xs text-sidebar-muted" title={email}>{email}</span>
        <button type="submit" className="flex items-center gap-1 self-start text-sm text-sidebar-ink underline underline-offset-4">
          Sign out <Icon name="signout" className="size-4" />
        </button>
      </span>
    </form>
  );
}

function Brand() {
  return (
    <div className="flex flex-col gap-1 px-3">
      <Logo tone="dark" className="text-[1.15rem]" />
      <span className="pl-[2.6rem] text-[0.6rem] tracking-[0.32em] text-sidebar-muted">OPERATIONS</span>
    </div>
  );
}

/** Dark left column on desktop; a dark header with a Menu on phones. */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="admin-sidebar hidden w-60 shrink-0 flex-col justify-between bg-sidebar px-3 py-6 text-sidebar-ink md:flex">
        <div className="flex flex-col gap-8">
          <Brand />
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
        </div>
        <Account email={email} />
      </aside>

      <details className="admin-sidebar bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-ink md:hidden">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4">
          <Logo tone="dark" className="text-[0.95rem]" />
          <span className="flex items-center gap-1">
            <RefreshButton />
            <span className="text-sm text-sidebar-muted">Menu</span>
          </span>
        </summary>
        <div className="flex flex-col gap-4 px-2 pb-4">
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
          <Account email={email} />
        </div>
      </details>
    </>
  );
}
