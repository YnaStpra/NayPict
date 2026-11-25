"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"
import { TeamSwitcher } from "@/components/layout/team-switcher"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { AdminMobileSpeedDial } from "@/components/admin/admin-mobile-speed-dial"
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
import { Activity, Archive, BrushCleaning, MonitorCog, Images, Trash2, FolderOpen, Database, Settings, CopyCheck, MessageSquare, BarChart3, MapPin } from "lucide-react"
import { NaypictLogo } from "@/components/icons/naypict-logo"

// Determine whether the current browser path hits the menu URL.

function isUrlMatched(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

// According to avatar key Generate avatar picture access address.
function getAvatarUrl(avatar: string | undefined, fallbackAvatar: string) {
  return avatar ? `/api/user/avatar/${avatar}` : fallbackAvatar
}

// Rendering the app sidebar, And generate navigation copy based on the current language.
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
        logo: <NaypictLogo className="size-4 text-foreground" />,
      },
      {
        name: t("systemSettings"),
        logo: <MonitorCog className="size-4 text-muted-foreground" />,
      },
    ],
    navMain: [
      { title: t("navigation.photos") || "Gallery", url: "/photos", icon: <Images className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/photos") },
      { title: t("navigation.albums"), url: "/albums", icon: <FolderOpen className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/albums") },
      { title: t("navigation.map"), url: "/map", icon: <MapPin className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/map") },
      { title: t("navigation.archive") || "Archive", url: "/archive", icon: <Archive className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/archive") },
      { title: t("navigation.comments"), url: "/comments", icon: <MessageSquare className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/comments") },
      { title: "Insights", url: "/admin/insights", icon: <BarChart3 className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/admin/insights") || isUrlMatched(pathname, "/insights") },
      { title: t("navigation.trash"), url: "/trash", icon: <Trash2 className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/trash") },
    ],
    sysMain: [
      { title: t("navigation.photoManage") || "Media Management", url: "/admin/photos", icon: <Images className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/admin/photos") },
      { title: "Visitor Analytics", url: "/admin/analytics", icon: <Activity className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/admin/analytics") },
      { title: t("navigation.storage"), url: "/storage", icon: <Database className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/storage") },
      { title: "Duplicate Media", url: "/duplicates", icon: <CopyCheck className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/duplicates") },
      { title: "Storage Cleaner", url: "/admin/cleaner", icon: <BrushCleaning className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/admin/cleaner") },
      { title: t("navigation.settings"), url: "/settings", icon: <Settings className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/settings") },
    ],

  }
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const albumTeam = {
    name: title,
    logo: data.teams[0].logo,
  }
  const teams = isAdmin ? [albumTeam, data.teams[1]] : [albumTeam]
  const isNavMainMatch = data.navMain.some((item) => isUrlMatched(pathname, item.url))
  const isSysMainMatch = data.sysMain.some((item) => isUrlMatched(pathname, item.url))
  const isSystemTeam =
    isAdmin &&
    !isNavMainMatch &&
    (pathname === "/admin" || pathname === "/admin/" || isSysMainMatch)
  const activeTeam = isSystemTeam ? data.teams[1] : albumTeam
  const navItems = React.useMemo(() => {
    return isSystemTeam
      ? data.sysMain
      : isAdmin
      ? data.navMain
      : [
          { title: t("navigation.photos") || "Gallery", url: "/photos", icon: <Images className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/photos") },
          { title: t("navigation.albums"), url: "/albums", icon: <FolderOpen className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/albums") },
          { title: t("navigation.map"), url: "/map", icon: <MapPin className="stroke-[1.5]" />, isActive: isUrlMatched(pathname, "/map") },
        ]
  }, [isSystemTeam, isAdmin, data.sysMain, data.navMain, t, pathname])
  const navUser = {
    ...data.user,
    name: userInfo?.username ?? data.user.name,
    avatar: getAvatarUrl(userInfo?.avatar, data.user.avatar),
  }

  // Proactively pre-warm core navigation routes so clicking any sidebar item opens in 0ms
  React.useEffect(() => {
    const coreRoutes = isAdmin ? ["/photos", "/albums", "/map", "/admin"] : ["/photos", "/albums", "/map"]
    coreRoutes.forEach((url) => {
      try {
        router.prefetch(url)
      } catch {}
    })
  }, [isAdmin, router])

  const handlePrewarmSidebar = React.useCallback(() => {
    navItems.forEach((item) => {
      try {
        router.prefetch(item.url)
      } catch {}
    })
  }, [navItems, router])

  // switch team Enter the corresponding team default page, Allow it to pass even after refreshing URL Determine current team.
  function changeTeam(team: { name: string; logo: React.ReactNode }) {
    const targetUrl = team.name === data.teams[1].name ? "/admin" : data.navMain[0].url

    setTimeout(() => {
      router.push(targetUrl)
    }, 100)
  }

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="yarl__no_scroll_padding"
        onPointerEnter={handlePrewarmSidebar}
        onTouchStart={handlePrewarmSidebar}
        {...props}
      >
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
      <MobileBottomNav />
      <AdminMobileSpeedDial />
    </>
  )
}
