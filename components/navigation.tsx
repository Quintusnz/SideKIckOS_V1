"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Gauge, GitBranch, Home, LayoutGrid, Settings } from "lucide-react";
import { useUIStore } from "@/store/ui";
import type { NavigationItem } from "@/types/ui";
import { cn } from "@/utils/cn";

const NAV_ITEMS: NavigationItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Workflows", href: "/workflows", icon: GitBranch },
  { label: "Knowledge", href: "/knowledge", icon: Archive },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
  const navCollapsed = useUIStore((state) => state.navCollapsed);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-white/5 bg-[#101526] transition-all duration-200",
        navCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#ef233c]">
        <LayoutGrid className="h-5 w-5" />
        {!navCollapsed && <span className="text-white">SideKick OS</span>}
      </div>
      <nav className="flex-1 space-y-2 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[#2b2d42]/70 text-zinc-100"
                  : "text-zinc-100/70 hover:bg-[#2b2d42]/50 hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {!navCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <footer className="px-4 pb-6 text-[12px] text-zinc-400/80">
        {!navCollapsed && <span>Concurrent runs supported</span>}
      </footer>
    </aside>
  );
}
