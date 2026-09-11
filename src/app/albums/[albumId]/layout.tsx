import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { AlbumPhotoProvider } from "@/app/albums/[albumId]/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"
import { orm } from "@/server/infra/db"
import { albumTab } from "@/server/entity/album"

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

  const [album] = await orm
    .select({
      albumId: albumTab.albumId,
      name: albumTab.name,
      isArchived: albumTab.isArchived,
    })
    .from(albumTab)
    .where(eq(albumTab.albumId, albumId))
    .limit(1);

  if (!album) {
    notFound();
  }

  // If album is archived, restrict access to authenticated users only
  if (album.isArchived === 1 && !userId) {
    notFound();
  }

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
    <AlbumPhotoProvider
      initialPhotos={data.list}
      album={{
        albumId: album.albumId,
        name: album.name,
        isArchived: album.isArchived ?? 0,
      }}
    >
      {children}
    </AlbumPhotoProvider>
  )
}
