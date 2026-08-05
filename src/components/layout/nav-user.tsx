"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ThemeSwitcher } from "@/components/layout/theme-switcher"
import { ChevronsUpDownIcon, UserRound, Key, BookOpen, LogOutIcon, LogIn } from "lucide-react"
import { logout } from "@/request/login"
import { useApp } from "@/app/provider"
import { useTranslations } from "next-intl"

const AvatarUpload = dynamic(
  () => import("@/components/layout/avatar-upload").then((mod) => mod.AvatarUpload),
  { ssr: false }
)
const UpdatePassword = dynamic(
  () => import("@/components/layout/update-password").then((mod) => mod.UpdatePassword),
  { ssr: false }
)

// Get avatar placeholder text，Get the first character of username。
function getAvatarFallback(name: string) {
  return Array.from(name.trim()).slice(0, 1).join("").toUpperCase()
}

// Render current user menu。
export function NavUser({
  user,
}: {
  user: {
    name: string
    /*    email: string*/
    avatar: string
  }
}) {
  const t = useTranslations("layout.userMenu")
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { userInfo, setUserInfo } = useApp()

  if (!userInfo) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={() => router.push("/login")}
            className="bg-primary/10 hover:bg-primary/20 text-primary font-medium flex items-center justify-center gap-2 rounded-lg w-full cursor-pointer"
          >
            <LogIn className="size-4" />
            <span>Admin Login</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  const fallback = getAvatarFallback(user.name)
  // fileInputRef Used to select the avatar picture first，Open the cropping pop-up again。
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // objectUrlRef Save the current address of the image to be cropped，Easy to free up memory。
  const objectUrlRef = useRef<string | null>(null)
  // image Save the image address currently passed to the avatar cropping pop-up frame。
  const [image, setImage] = useState("")
  // avatarOpen Control the opening status of the avatar upload pop-up box。
  const [avatarOpen, setAvatarOpen] = useState(false)
  // passwordOpen Control the opening status of the password change popup box。
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  // Log out and jump back to login page。
  function logoutUser() {
    logout().then(() => {
      router.replace("/login")
      setUserInfo(null)
    })
  }

  // Open the avatar picture selector。
  function openAvatarUpload() {
    fileInputRef.current?.click()
  }

  // After selecting the avatar picture, open the cropping pop-up box。
  function changeAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }

    objectUrlRef.current = URL.createObjectURL(file)
    setImage(objectUrlRef.current)
    setAvatarOpen(true)
  }

  // save avatar key Update global user information later，The display address is given by props calculate。
  function updateAvatar(avatarKey: string) {
    setUserInfo((prev) => prev ? { ...prev, avatar: avatarKey } : prev)
  }

  // Open the change password pop-up box。
  function openUpdatePassword() {
    setPasswordOpen(true)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg after:rounded-lg">
                  {user.avatar ? (
                    <AvatarImage className="rounded-lg" src={user.avatar} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  {/*<span className="truncate text-xs">{user.email}</span>*/}
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg after:rounded-lg">
                    {user.avatar ? (
                      <AvatarImage className="rounded-lg" src={user.avatar} alt={user.name} />
                    ) : null}
                    <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    {/*<span className="truncate text-xs">{user.email}</span>*/}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ThemeSwitcher />
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={openAvatarUpload}>
                  <UserRound />
                  {t("changeAvatar")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openUpdatePassword}>
                  <Key />
                  {t("changePassword")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <BookOpen />
                  {t("documentation")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logoutUser}>
                <LogOutIcon />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={changeAvatarFile}
      />
      <AvatarUpload
        open={avatarOpen}
        image={image}
        name={user.name}
        onOpenChange={setAvatarOpen}
        onAvatarChange={updateAvatar}
      />
      <UpdatePassword
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </>
  )
}
