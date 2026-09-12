import { photoService } from "@/server/service/photo-service"
import { LandingClient } from "@/components/landing/landing-client"
import { type PhotoVo } from "@/server/entity/vo/photo"

// Revalidate landing showcase photos every 5 minutes (ISR) to eliminate serverless CPU burn
export const revalidate = 300

// Server-side Landing Page: Pre-fetches random gallery photos to eliminate loading flash and enable instant rendering
export default async function Home() {
  let initialPhotos: PhotoVo[] = []
  try {
    const data = await photoService.list({
      size: 40,
      cursorPhotoId: null,
      cursorTime: null,
      status: null,
      albumId: null,
      shuffle: true,
    })

    initialPhotos = data.list || []
  } catch (err) {
    console.warn("[Landing] Failed to fetch server photos, fallback to empty list:", err)
  }

  return <LandingClient initialPhotos={initialPhotos} />
}
