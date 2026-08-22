import { cookies } from "next/headers"
import { ArchiveProvider } from "@/app/archive/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { photoService } from "@/server/service/photo-service"

interface ArchiveLayoutProps {
  children: React.ReactNode
}

// Server Component: Fetches initial archived photos for admin archive page
export default async function ArchiveLayout({ children }: ArchiveLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  const data = await photoService.list({
    size: PHOTO_LIST_PAGE_SIZE,
    cursorPhotoId: null,
    cursorTime: null,
    status: null,
    albumId: null,
    visibility: PhotoVisibilityEnum.ARCHIVED,
  }, userId || undefined)

  return (
    <ArchiveProvider initialPhotos={data.list}>
      {children}
    </ArchiveProvider>
  )
}
