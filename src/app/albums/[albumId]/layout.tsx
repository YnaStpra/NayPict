import { cookies } from "next/headers"
import { AlbumPhotoProvider } from "@/app/albums/[albumId]/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"

interface AlbumPhotoLayoutProps {
  children: React.ReactNode
  params: Promise<{
    albumId: string
  }>
}

// The server queries the first page of photos in the current album，And provide it to the album photo page initialization list。
export default async function AlbumPhotoLayout({ children, params }: AlbumPhotoLayoutProps) {
  const { albumId } = await params
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
    status: null,
    albumId,
  }, userId)

  return (
    <AlbumPhotoProvider initialPhotos={data.list}>
      {children}
    </AlbumPhotoProvider>
  )
}
