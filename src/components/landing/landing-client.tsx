'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Camera, FolderHeart, Image as ImageIcon, ArrowRight, Loader2, MapPin } from 'lucide-react'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { photoList } from '@/request/photo'

// Dynamic import InfiniteGallery with ssr: false for smooth client canvas initialization
const InfiniteGallery = dynamic(
  () => import('@/components/gallery/infinite-gallery').then((mod) => mod.InfiniteGallery),
  { ssr: false }
)

interface LandingClientProps {
  initialPhotos: PhotoVo[]
}

export function LandingClient({ initialPhotos }: LandingClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotos || [])

  // Handle direct photo share URL redirect (e.g. /?photoId=123 -> /photos?photoId=123)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const photoId = new URLSearchParams(window.location.search).get('photoId')
      if (photoId) {
        window.location.href = `/photos?photoId=${photoId}`
        return
      }
    }

    // Eagerly prefetch the gallery and albums routes as soon as landing page mounts
    router.prefetch('/photos')
    router.prefetch('/albums')
  }, [router])

  // Fetch client-side if initialPhotos was empty
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      return
    }

    photoList({ size: 40, shuffle: true })
      .then((res) => {
        if (res?.list && res.list.length > 0) {
          setPhotos(res.list)
        }
      })
      .catch((err) => {
        console.error('[Landing] Failed to fetch gallery photos:', err)
      })
  }, [initialPhotos])

  const displayPhotos = photos.length > 0 ? photos : initialPhotos

  const handleNavigate = (href: string) => {
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Dynamic Infinite Canvas Background using Real Photos */}
      <div className="absolute inset-0 z-0">
        <InfiniteGallery
          photos={displayPhotos}
          driftAmount={0.3}
          dragSpeed={0.8}
          className="w-full h-full"
        />
        {/* Subtle Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/70 backdrop-blur-[2px] pointer-events-none" />
      </div>

      {/* Floating Centered Hero Card */}
      <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
        <div
          id="landing-hero-card"
          className="pointer-events-auto max-w-sm sm:max-w-md w-full rounded-3xl bg-black/50 backdrop-blur-2xl border border-white/20 shadow-2xl p-6 sm:p-8 text-center text-white flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500"
          style={{
            forcedColorAdjust: 'none',
            colorScheme: 'normal',
          }}
        >
          {/* Logo & Icon */}
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-white/20 via-slate-200/30 to-white/20 opacity-75 blur-md animate-pulse" />
            <div className="relative size-16 sm:size-20 rounded-2xl bg-gradient-to-br from-neutral-900 to-black border border-white/20 flex items-center justify-center shadow-xl">
              <Camera className="size-8 sm:size-10 text-white" />
            </div>
          </div>

          {/* Title & Tagline */}
          <div className="space-y-2">
            <h1
              className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md"
              style={{
                color: '#ffffff',
                forcedColorAdjust: 'none',
                colorScheme: 'normal',
              }}
            >
              NayPict
            </h1>
            <p
              className="text-xs sm:text-sm text-slate-300 font-medium max-w-xs mx-auto leading-relaxed"
              style={{
                color: 'rgba(203, 213, 225, 0.95)',
                forcedColorAdjust: 'none',
              }}
            >
              Aesthetic Photo Gallery & Curated Album Collection
            </p>
          </div>

          {/* Navigation Action Buttons with Instant Prefetch & Feedback */}
          <div className="flex flex-col gap-3 w-full pt-2">
            <Link
              href="/photos"
              prefetch={true}
              onMouseEnter={() => router.prefetch('/photos')}
              onPointerDown={() => router.prefetch('/photos')}
              onClick={(e) => {
                e.preventDefault()
                handleNavigate('/photos')
              }}
              className="group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
              style={{
                color: '#ffffff',
                forcedColorAdjust: 'none',
                colorScheme: 'normal',
              }}
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="size-5 text-white/90" />
                <span>Explore Gallery</span>
              </div>
              <div className="flex items-center">
                {isPending ? (
                  <Loader2 className="size-4 animate-spin opacity-80" />
                ) : (
                  <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                )}
              </div>
            </Link>

            <Link
              href="/albums"
              prefetch={true}
              onMouseEnter={() => router.prefetch('/albums')}
              onPointerDown={() => router.prefetch('/albums')}
              onClick={(e) => {
                e.preventDefault()
                handleNavigate('/albums')
              }}
              className="group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
              style={{
                color: '#ffffff',
                forcedColorAdjust: 'none',
                colorScheme: 'normal',
              }}
            >
              <div className="flex items-center gap-3">
                <FolderHeart className="size-5 text-white/90" />
                <span>Browse Albums</span>
              </div>
              <div className="flex items-center">
                {isPending ? (
                  <Loader2 className="size-4 animate-spin opacity-80" />
                ) : (
                  <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                )}
              </div>
            </Link>

            <Link
              href="/map"
              prefetch={true}
              onMouseEnter={() => router.prefetch('/map')}
              onPointerDown={() => router.prefetch('/map')}
              onClick={(e) => {
                e.preventDefault()
                handleNavigate('/map')
              }}
              className="group relative flex items-center justify-between w-full h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm sm:text-base backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
              style={{
                color: '#ffffff',
                forcedColorAdjust: 'none',
                colorScheme: 'normal',
              }}
            >
              <div className="flex items-center gap-3">
                <MapPin className="size-5 text-white/90" />
                <span>Photo Map Explorer</span>
              </div>
              <div className="flex items-center">
                {isPending ? (
                  <Loader2 className="size-4 animate-spin opacity-80" />
                ) : (
                  <ArrowRight className="size-4 opacity-75 group-hover:translate-x-1 transition-transform" />
                )}
              </div>
            </Link>
          </div>

        </div>
      </div>
    </main>
  )
}
