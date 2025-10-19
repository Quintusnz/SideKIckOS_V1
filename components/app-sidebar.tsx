import * as React from "react"
import {
  Bot,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Workflow,
} from "lucide-react"
import { usePathname } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

const teams = [
  {
    name: "Sidekick OS",
    plan: "Enterprise",
    logo: Bot,
  },
  {
    name: "Ops R&D",
    plan: "Pilot",
    logo: Workflow,
  },
]

const projects = [
  {
    name: "Ops Refresh",
    url: "/settings/admin/observability",
    icon: Workflow,
  },
  {
    name: "Knowledge Sync",
    url: "/knowledge",
    icon: Lightbulb,
  },
  {
    name: "Runbook QA",
    url: "/workflows",
    icon: Bot,
  },
]

const user = {
  name: "Lena Quinn",
  email: "lena@sidekick.os",
  avatar: "https://avatars.dicebear.com/api/initials/lena-quinn.svg",
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  const navItems = React.useMemo(
    () => [
      {
        title: "Workbench",
        url: "/",
        icon: Bot,
        isActive: pathname === "/",
        items: [
          { title: "Conversation", url: "/" },
          { title: "Modern Workbench", url: "/workbench/modern" },
        ],
      },
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
        isActive: pathname?.startsWith("/dashboard"),
        items: [
          { title: "Overview", url: "/dashboard" },
          { title: "Settings", url: "/settings" },
        ],
      },
      {
        title: "Knowledge",
        url: "/knowledge",
        icon: Lightbulb,
        isActive: pathname?.startsWith("/knowledge"),
        items: [{ title: "Corpus", url: "/knowledge" }],
      },
      {
        title: "Workflows",
        url: "/workflows",
        icon: Workflow,
        isActive: pathname?.startsWith("/workflows"),
        items: [{ title: "Orchestrations", url: "/workflows" }],
      },
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
        isActive: pathname?.startsWith("/settings"),
        items: [
          { title: "General", url: "/settings" },
          { title: "Admin Observability", url: "/settings/admin/observability" },
        ],
      },
    ],
    [pathname]
  )

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <NavProjects projects={projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
