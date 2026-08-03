import { cookies } from "next/headers"
import { TrashProvider } from "@/app/trash/provider"
import { getLoginInfo } from "@/lib/cookie"
import { albumService } from "@/server/service/album-service"

interface TrashLayoutProps {
  children: React.ReactNode
}

// Server side query recycle bin virtual photo album，and provided to /trash Page initialization entry。
export default async function TrashLayout({ children }: TrashLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  if (!userId) {
    return null
  }

  const data = await albumService.trash(userId)

  return (
    <TrashProvider initialAlbum={data}>
      {children}
    </TrashProvider>
  )
}
