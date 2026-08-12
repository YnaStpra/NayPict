"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"
import { TeamSwitcher } from "@/components/layout/team-switcher"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useTranslations } from "next-intl"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Library, MonitorCog, Image, Heart, Trash2, FolderOpen, Database, User, Settings } from "lucide-react"

// Determine whether the current browser path hits the menu URL。
function isUrlMatched(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

// According to avatar key Generate avatar picture access address。
function getAvatarUrl(avatar: string | undefined, fallbackAvatar: string) {
  return avatar ? `/api/user/avatar/${avatar}` : fallbackAvatar
}

// Rendering the app sidebar，And generate navigation copy based on the current language。
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("layout")
  const pathname = usePathname()
  const router = useRouter()
  const { userInfo, title } = useApp()
  const data = {
    user: {
      name: "",
      email: null,
      avatar: "",
    },
    teams: [
      {
        name: "",
        logo: <Library />,
      },
      {
        name: t("systemSettings"),
        logo: <MonitorCog />,
      },
    ],
    navMain: [
      { title: t("navigation.photos"), url: "/photos", icon: <Image />, isActive: false },
      { title: t("navigation.favorites"), url: "/favorites", icon: <Heart />, isActive: false },
      { title: t("navigation.albums"), url: "/albums", icon: <FolderOpen />, isActive: true },
      { title: t("navigation.trash"), url: "/trash", icon: <Trash2 />, isActive: false },
    ],
    sysMain: [
      { title: t("navigation.storage"), url: "/storage", icon: <Database />, isActive: false },
      { title: t("navigation.settings"), url: "/settings", icon: <Settings />, isActive: false },
    ],
  }
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const albumTeam = {
    name: title,
    logo: data.teams[0].logo,
  }
  const teams = isAdmin ? [albumTeam, data.teams[1]] : [albumTeam]
  const isSystemTeam = isAdmin && data.sysMain.some((item) => isUrlMatched(pathname, item.url))
  const activeTeam = isSystemTeam ? data.teams[1] : albumTeam
  const navItems = isSystemTeam
    ? data.sysMain
    : isAdmin
    ? data.navMain
    : [
        { title: t("navigation.photos"), url: "/photos", icon: <Image />, isActive: isUrlMatched(pathname, "/photos") },
        { title: t("navigation.albums"), url: "/albums", icon: <FolderOpen />, isActive: isUrlMatched(pathname, "/albums") },
      ]
  const navUser = {
    ...data.user,
    name: userInfo?.username ?? data.user.name,
    avatar: getAvatarUrl(userInfo?.avatar, data.user.avatar),
  }

  // switch team Enter the corresponding team default page，Allow it to pass even after refreshing URL Determine current team。
  function changeTeam(team: { name: string; logo: React.ReactNode }) {
    const targetUrl = team.name === data.teams[1].name ? data.sysMain[0].url : data.navMain[0].url

    setTimeout(() => {
      router.push(targetUrl)
    }, 100)
  }

  return (
    <Sidebar collapsible="icon" className="yarl__no_scroll_padding" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={teams}
          activeTeam={activeTeam}
          onTeamChange={changeTeam}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
