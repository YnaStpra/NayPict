import { cookies } from "next/headers"
import { photoService } from "@/server/service/photo-service"
import { getLoginInfo } from "@/lib/cookie"
import { LandingClient } from "@/components/landing/landing-client"
import { type PhotoVo } from "@/server/entity/vo/photo"

// Server-side Landing Page: Pre-fetches random gallery photos to eliminate loading flash and enable instant rendering
export default async function Home() {
  const cookieStore = await cookies()
  const { userId } = await getLoginInfo(cookieStore.toString())

  let initialPhotos: PhotoVo[] = []
  try {
    const data = await photoService.list({
      size: 40,
      cursorPhotoId: null,
      cursorTime: null,
      status: null,
      albumId: null,
      shuffle: true,
    }, userId || undefined)

    initialPhotos = data.list || []
  } catch (err) {
    console.warn("[Landing] Failed to fetch server photos, fallback to empty list:", err)
  }

  return <LandingClient initialPhotos={initialPhotos} />
}
