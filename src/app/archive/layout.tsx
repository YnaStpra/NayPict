import { cookies } from "next/headers"
import { ArchiveProvider } from "@/app/archive/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { photoService } from "@/server/service/photo-service"
import { albumService } from "@/server/service/album-service"

interface ArchiveLayoutProps {
  children: React.ReactNode
}

// Server Component: Fetches initial archived albums & photos for admin archive page
export default async function ArchiveLayout({ children }: ArchiveLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  const [photoData, archivedAlbums] = await Promise.all([
    photoService.list({
      size: PHOTO_LIST_PAGE_SIZE,
      cursorPhotoId: null,
      cursorTime: null,
      status: null,
      albumId: null,
      visibility: PhotoVisibilityEnum.ARCHIVED,
    }, userId || undefined),
    albumService.list(userId || undefined, 1),
  ])

  return (
    <ArchiveProvider initialPhotos={photoData.list} initialAlbums={archivedAlbums}>
      {children}
    </ArchiveProvider>
  )
}
