import { cookies } from "next/headers"
import { AlbumProvider } from "@/app/albums/provider"
import { getLoginInfo } from "@/lib/cookie"
import { albumService } from "@/server/service/album-service"

// Incremental Static Regeneration (ISR): Cache public album layout on Edge CDN with 5-minute background revalidation
export const revalidate = 300;

interface AlbumLayoutProps {
  children: React.ReactNode
}

// Query all photo albums on the server，and provided to /album Page initialization list。
export default async function AlbumLayout({ children }: AlbumLayoutProps) {
  const data = await albumService.list()

  return (
    <AlbumProvider initialAlbums={data}>
      {children}
    </AlbumProvider>
  )
}
