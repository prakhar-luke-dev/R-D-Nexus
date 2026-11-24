"use client";

import { Activity, FlaskConical, LayoutList, Library, Network, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/primitives";
import { useGraphUI } from "@/features/graph/store";

const NAV = [
  { href: "/", label: "Graph", icon: Network },
  { href: "/initiatives", label: "Initiatives", icon: LayoutList },
  { href: "/library", label: "Research Library", icon: Library },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/activity", label: "Activity", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const presentation = useGraphUI((s) => s.presentation);
  if (presentation && pathname === "/") return null;

  const item = (n: (typeof NAV)[number] | { href: string; label: string; icon: typeof Settings }) => {
    const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        title={n.label}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
          active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")} />
        <span className="hidden xl:inline">{n.label}</span>
      </Link>
    );
  };

  return (
    <aside className="flex w-[60px] shrink-0 flex-col border-r border-border bg-bg-elev px-2 py-4 xl:w-[216px] xl:px-3">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-1.5">
        <Logo />
        <div className="hidden leading-tight xl:block">
          <div className="text-[13px] font-semibold tracking-tight text-text">R&amp;D Nexus</div>
          <div className="text-[10.5px] text-faint">AI Innovation Graph</div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">{NAV.map(item)}</nav>
      <div className="mt-4 border-t border-border pt-3">{item({ href: "/settings", label: "Settings", icon: Settings })}</div>
    </aside>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b99ff" />
          <stop offset="1" stopColor="#5b6cf0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#121729" stroke="#2a3150" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--code)" strokeWidth="2" strokeDasharray="42 60" strokeLinecap="round" transform="rotate(-90 16 16)" />
      <circle cx="16" cy="16" r="5.5" fill="none" stroke="var(--validation)" strokeWidth="2" strokeDasharray="22 40" strokeLinecap="round" transform="rotate(-90 16 16)" />
      <circle cx="16" cy="16" r="2" fill="url(#lg)" />
    </svg>
  );
}
