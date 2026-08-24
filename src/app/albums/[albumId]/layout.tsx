import { cookies } from "next/headers"
import { AlbumPhotoProvider } from "@/app/albums/[albumId]/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"

// Incremental Static Regeneration (ISR): Cache album photo layout on Edge CDN with 5-minute background revalidation
export const revalidate = 300;

interface AlbumPhotoLayoutProps {
  children: React.ReactNode
  params: Promise<{
    albumId: string
  }>
}

// The server queries photos in the current album (publicly for guests or user-specific for logged-in admin).
export default async function AlbumPhotoLayout({ children, params }: AlbumPhotoLayoutProps) {
  const { albumId } = await params
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  // Use shuffle so each page load returns a different random order from the album
  const data = await photoService.list({
    size: PHOTO_LIST_PAGE_SIZE,
    cursorPhotoId: null,
    cursorTime: null,
    status: null,
    albumId,
    shuffle: true,
  }, userId || undefined)

  return (
    <AlbumPhotoProvider initialPhotos={data.list}>
      {children}
    </AlbumPhotoProvider>
  )
}
