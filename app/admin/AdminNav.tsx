"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";

const LINKS = [
  { href: "/admin", label: "Jobs" },
  { href: "/admin/jobs/new", label: "New job" },
  { href: "/admin/settings", label: "Settings" },
] as const;

/** A job page belongs under Jobs; the new-job form has its own entry. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || (pathname.startsWith("/admin/jobs/") && pathname !== "/admin/jobs/new");
  }
  return pathname === href;
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map(({ href, label }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block border-l-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-charcoal font-semibold text-charcoal"
                  : "border-transparent text-ink-soft hover:text-charcoal"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SignOut({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex flex-col gap-1 px-3">
      <span className="truncate text-xs text-ink-soft" title={email}>{email}</span>
      <button type="submit" className="self-start text-sm text-charcoal underline underline-offset-4">
        Sign out
      </button>
    </form>
  );
}

/** Left column on desktop; a Menu button opening the same links on phones. */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-rule py-6 md:flex">
        <div className="flex flex-col gap-6">
          <p className="px-3 text-base font-semibold">PSS Jobs</p>
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
        </div>
        <SignOut email={email} />
      </aside>

      <details className="border-b border-rule md:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-base font-semibold">
          PSS Jobs <span className="text-sm font-normal text-ink-soft">Menu</span>
        </summary>
        <div className="flex flex-col gap-4 pb-4">
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} />
          </nav>
          <SignOut email={email} />
        </div>
      </details>
    </>
  );
}
