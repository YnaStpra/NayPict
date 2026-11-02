import { Suspense } from "react"
import { cookies } from "next/headers"
import { PhotoProvider } from "@/app/photos/provider"
import { getLoginInfo } from "@/lib/cookie"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoService } from "@/server/service/photo-service"

interface PhotoLayoutProps {
  children: React.ReactNode
}

// Asynchronously resolve server-side initial photo data without blocking page shell streaming
async function PhotoDataProvider({ children }: { children: React.ReactNode }) {
  let initialPhotos: any[] = []
  let initialTotal = 0
  try {
    const cookieStore = await cookies()
    const { userId } = await getLoginInfo(cookieStore.toString())

    const data = await photoService.list({
      size: PHOTO_LIST_PAGE_SIZE,
      cursorPhotoId: null,
      cursorTime: null,
      status: null,
      albumId: null,
      shuffle: true,
    }, userId || undefined)

    initialPhotos = data.list || []
    initialTotal = data.total ?? 0
  } catch (err: any) {
    if (err?.digest === 'DYNAMIC_SERVER_USAGE' || err?.message?.includes('Dynamic server usage')) {
      throw err;
    }
    console.warn("[PhotoLayout] Failed to prefetch server photos:", err)
  }

  return (
    <PhotoProvider initialPhotos={initialPhotos} initialTotal={initialTotal}>
      {children}
    </PhotoProvider>
  )
}

// Synchronous layout shell: immediately streams HTML, CSS, sidebar, and IndexedDB cache with 0ms TTFB
export default function PhotoLayout({ children }: PhotoLayoutProps) {
  return (
    <Suspense fallback={<PhotoProvider initialPhotos={[]} initialTotal={0}>{children}</PhotoProvider>}>
      <PhotoDataProvider>
        {children}
      </PhotoDataProvider>
    </Suspense>
  )
}
