import { cookies } from "next/headers"
import { StorageProvider } from "@/app/storage/provider"
import { getLoginInfo } from "@/lib/cookie"
import { storageService } from "@/server/service/storage-service"

interface StorageLayoutProps {
  children: React.ReactNode
}

// Server query storage configuration list，and provided to /storage Page initialization form。
export default async function StorageLayout({ children }: StorageLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  if (!userId) {
    return null
  }

  const data = await storageService.list()

  return (
    <StorageProvider initialStorageList={data.list}>
      {children}
    </StorageProvider>
  )
}
