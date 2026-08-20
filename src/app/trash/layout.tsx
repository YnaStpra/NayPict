import { cookies } from "next/headers"
import { TrashProvider } from "@/app/trash/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"
import { photoService } from "@/server/service/photo-service"

interface TrashLayoutProps {
  children: React.ReactNode
}

// Server side prefetch recycled photos for /trash page.
export default async function TrashLayout({ children }: TrashLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  if (!userId) {
    return null
  }

  const data = await photoService.list({
    size: PHOTO_LIST_PAGE_SIZE,
    cursorPhotoId: null,
    cursorTime: null,
    favorite: null,
    status: PhotoStatusEnum.DELETE,
    albumId: null,
  }, userId)

  return (
    <TrashProvider initialPhotos={data.list}>
      {children}
    </TrashProvider>
  )
}
