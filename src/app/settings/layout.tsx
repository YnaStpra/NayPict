import { cookies } from "next/headers"
import { SettingProvider } from "@/app/settings/provider"
import { getLoginInfo } from "@/lib/cookie"
import { settingService } from "@/server/service/setting-service"

interface SettingLayoutProps {
  children: React.ReactNode
}

// Server query system settings, and provided to /setting Page initialization display.
export default async function SettingLayout({ children }: SettingLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  if (!userId) {
    return null
  }

  const initialSetting = await settingService.get()

  return (
    <SettingProvider initialSetting={initialSetting}>
      {children}
    </SettingProvider>
  )
}
