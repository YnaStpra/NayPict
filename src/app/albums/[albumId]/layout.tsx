import { notFound } from "next/navigation"
import { eq, or, isNull } from "drizzle-orm"
import { AlbumPhotoProvider } from "@/app/albums/[albumId]/provider"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"
import { orm } from "@/server/infra/db"
import { albumTab } from "@/server/entity/album"

// Incremental Static Regeneration (ISR): Cache album photo layout on Edge CDN with 5-minute background revalidation
export const revalidate = 300;
export const dynamicParams = true;

// Pre-render public albums for instant Edge CDN responses and zero serverless invocation cost
export async function generateStaticParams() {
  try {
    const albums = await orm
      .select({ albumId: albumTab.albumId })
      .from(albumTab)
      .where(or(eq(albumTab.isArchived, 0), isNull(albumTab.isArchived)))
      .limit(50);
    return albums.map((a) => ({ albumId: a.albumId }));
  } catch {
    return [];
  }
}

interface AlbumPhotoLayoutProps {
  children: React.ReactNode
  params: Promise<{
    albumId: string
  }>
}

// The server queries photos in the current album publicly, caching the initial page on Edge CDN with 0ms serverless hits
export default async function AlbumPhotoLayout({ children, params }: AlbumPhotoLayoutProps) {
  const { albumId } = await params

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

  const isArchived = album.isArchived === 1;

  // For public non-archived albums, prefetch photos for instant Edge CDN delivery (0ms serverless invocation on cache hit).
  // For archived albums, withhold photos from the public Edge CDN cache; photos are fetched client-side with admin session.
  const data = isArchived
    ? { list: [], total: 0 }
    : await photoService.list({
        size: PHOTO_LIST_PAGE_SIZE,
        cursorPhotoId: null,
        cursorTime: null,
        status: null,
        albumId,
        shuffle: true,
      });

  return (
    <AlbumPhotoProvider
      initialPhotos={data.list}
      initialTotal={data.total ?? 0}
      album={{
        albumId: album.albumId,
        name: album.name,
        isArchived: isArchived ? 1 : 0,
      }}
    >
      {children}
    </AlbumPhotoProvider>
  )
}
