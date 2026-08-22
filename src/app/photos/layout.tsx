import { cookies } from "next/headers"
import { PhotoProvider } from "@/app/photos/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"

interface PhotoLayoutProps {
  children: React.ReactNode
}

// Query the photo list on the server side (publicly for guests or user-specific for logged-in admin).
export default async function PhotoLayout({ children }: PhotoLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  // Use shuffle so each page load returns a different random order from the full library
  const data = await photoService.list({
    size: PHOTO_LIST_PAGE_SIZE,
    cursorPhotoId: null,
    cursorTime: null,
    status: null,
    albumId: null,
    shuffle: true,
  }, userId || undefined)

  return (
    <PhotoProvider initialPhotos={data.list}>
      {children}
    </PhotoProvider>
  )
}
