import { cookies } from "next/headers"
import { TrashPhotoProvider } from "@/app/trash/photos/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"

interface TrashPhotoLayoutProps {
  children: React.ReactNode
}

// The server queries the first page of photos in the recycle bin, And provide it to the recycle bin photo page initialization list.
export default async function TrashPhotoLayout({ children }: TrashPhotoLayoutProps) {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  if (!userId) {
    return null
  }

  const data = await photoService.list({
    size: PHOTO_LIST_PAGE_SIZE,
    cursorPhotoId: null,
    cursorTime: null,
    status: PhotoStatusEnum.DELETE,
    albumId: null,
  }, userId)

  return (
    <TrashPhotoProvider initialPhotos={data.list}>
      {children}
    </TrashPhotoProvider>
  )
}
