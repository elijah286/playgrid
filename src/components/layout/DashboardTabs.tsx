import Link from "next/link";

type Tab = { href: string; label: string; key: "playbooks" | "formations" };

const TABS: Tab[] = [
  { href: "/home", label: "Playbooks", key: "playbooks" },
  { href: "/formations", label: "Formations", key: "formations" },
];

export function DashboardTabs({ active }: { active: Tab["key"] }) {
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1" aria-label="Dashboard sections">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:border-border hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
