import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { ViewSwitch } from "./ViewSwitch";

type NavLink = { href: string; text: string };

/** The Schedule page header shared by the week and month views: title, range label, view switch and paging. */
export function ScheduleHeader({
  label, view, switchHrefs, nav,
}: {
  label: string;
  view: "week" | "month";
  switchHrefs: { week: string; month: string };
  nav: { label: string; previous: NavLink; current: NavLink & { icon?: boolean }; next: NavLink };
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
        <h1 className="text-3xl font-semibold text-charcoal">Schedule</h1>
        <p className="text-sm text-ink-soft">{label}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ViewSwitch active={view} weekHref={switchHrefs.week} monthHref={switchHrefs.month} />
        <nav aria-label={nav.label} className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={nav.previous.href} className="underline underline-offset-4">{nav.previous.text}</Link>
          <Link href={nav.current.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 font-medium text-ivory">
            {nav.current.icon ? <Icon name="calendar" className="size-4" /> : null}
            {nav.current.text}
          </Link>
          <Link href={nav.next.href} className="underline underline-offset-4">{nav.next.text}</Link>
        </nav>
      </div>
    </header>
  );
}
