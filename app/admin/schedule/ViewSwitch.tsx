import Link from "next/link";

function SwitchLink({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium ${current ? "bg-charcoal text-ivory" : "text-charcoal hover:bg-sand/60"}`}
    >
      {children}
    </Link>
  );
}

export function ViewSwitch({
  weekHref, monthHref, active,
}: {
  weekHref: string; monthHref: string; active: "week" | "month";
}) {
  return (
    <nav aria-label="View" className="flex items-center gap-1 rounded-lg border border-rule bg-sand/40 p-1">
      <SwitchLink href={weekHref} current={active === "week"}>Week</SwitchLink>
      <SwitchLink href={monthHref} current={active === "month"}>Month</SwitchLink>
    </nav>
  );
}
