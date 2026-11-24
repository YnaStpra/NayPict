'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  FolderHeart,
  Image as ImageIcon,
  ArrowRight,
  MapPin,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { NaypictLogo } from '@/components/icons/naypict-logo'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { photoLandingList } from '@/request/photo'
import { saveOfflineCatalog } from '@/lib/offline-catalog'
import { markThumbnailLoaded } from '@/components/photo/photo-card'

// Dynamic import InfiniteGallery with ssr: false for smooth client canvas initialization
const InfiniteGallery = dynamic(
  () => import('@/components/gallery/infinite-gallery').then((mod) => mod.InfiniteGallery),
  { ssr: false }
)

interface LandingClientProps {
  initialPhotos: PhotoVo[]
  initialTotal?: number
}

export function LandingClient({ initialPhotos, initialTotal }: LandingClientProps) {
  const router = useRouter()
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotos || [])
  const [navigatingTarget, setNavigatingTarget] = useState<string | null>(null)
  const [isZenMode, setIsZenMode] = useState(false)

  // Reset loading state if browser navigates back to landing page via bfcache
  useEffect(() => {
    const handlePageShow = () => setNavigatingTarget(null)
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  // Seed gallery catalog cache and pre-warm thumbnail memory cache for 0ms zero-skeleton transition into /photos
  useEffect(() => {
    if (photos && photos.length > 0) {
      const total = initialTotal ?? photos.length
      saveOfflineCatalog(photos, total)
      photos.forEach((photo) => {
        const src = photo.thumbnail || photo.preview || photo.key
        if (src) {
          markThumbnailLoaded(src)
        }
      })
    }
  }, [photos, initialTotal])

  // Seamless click-through directly from background canvas photo to photo viewer in /photos
  const handlePhotoClick = useCallback((index: number, photo?: PhotoVo) => {
    if (photo?.photoId) {
      router.push(`/photos?photoId=${photo.photoId}`)
    }
  }, [router])

  // Instantly prefetch primary gallery routes as soon as landing mounts
  useEffect(() => {
    router.prefetch('/photos')
    router.prefetch('/albums')
    router.prefetch('/map')
  }, [router])

  // Hardware-Accelerated Spotlight Glow Follower Ref
  const spotlightRef = useRef<HTMLDivElement>(null)
  const rafSpotlightRef = useRef<number | null>(null)

  // Handle direct photo share URL redirect (e.g. /?photoId=123 -> /photos?photoId=123)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const photoId = new URLSearchParams(window.location.search).get('photoId')
      if (photoId) {
        router.replace(`/photos?photoId=${photoId}`)
        return
      }
    }
  }, [router])

  // Fetch client-side if initialPhotos was empty
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) return

    photoLandingList(70)
      .then((res) => {
        if (res?.list && res.list.length > 0) {
          setPhotos(res.list)
        }
      })
      .catch((err) => {
        console.error('[Landing] Failed to fetch gallery photos:', err)
      })
  }, [initialPhotos])

  // Keyboard shortcut listener: 'Z' toggles Zen mode, 'Escape' exits Zen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false)
      } else if ((e.key === 'z' || e.key === 'Z') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setIsZenMode((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isZenMode])

  // Zero-React-Rerender Hardware-Accelerated Spotlight Tracking for Desktop/Pointer
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const clientX = e.clientX
    const clientY = e.clientY

    if (rafSpotlightRef.current !== null) {
      cancelAnimationFrame(rafSpotlightRef.current)
    }

    rafSpotlightRef.current = requestAnimationFrame(() => {
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${clientX - 325}px, ${clientY - 325}px, 0)`
        spotlightRef.current.style.opacity = '1'
      }
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (rafSpotlightRef.current !== null) {
      cancelAnimationFrame(rafSpotlightRef.current)
    }

    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '0'
    }
  }, [])

  const displayPhotos = useMemo(() => {
    const list = photos.length > 0 ? photos : initialPhotos
    return list.filter((p) => !p.type?.startsWith('video/'))
  }, [photos, initialPhotos])

  const totalCuratedCount = initialTotal || photos.length || 0

  return (
    <main
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-screen h-screen h-[100dvh] overflow-hidden bg-black select-none"
    >
      {/* Zero-Overhead Hardware-Composited Spotlight Glow Follower (Pointer / Desktop only) */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute top-0 left-0 size-[650px] rounded-full opacity-0 transition-opacity duration-300 z-10 will-change-transform hidden lg:block"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 45%, transparent 70%)',
        }}
      />

      {/* Dynamic 100% Full-Screen Infinite Canvas Background with Touch Momentum */}
      <div className="absolute inset-0 z-0">
        <InfiniteGallery
          photos={displayPhotos}
          onPhotoClick={handlePhotoClick}
          density={15}
          imageWidth={175}
          imageHeight={175}
          rounded={10}
          driftAmount={14}
          dragSpeed={18}
          friction={10}
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        />
        {/* Multi-Layer Depth Vignette Mask */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/65 backdrop-blur-[1px] pointer-events-none" />

        {/* Ambient Top-Left Dark Scrim: Prevents bright floating photos from washing out editorial typography */}
        <div
          className="pointer-events-none absolute top-0 left-0 w-full max-w-[700px] h-[520px] z-10"
          style={{
            background:
              'radial-gradient(ellipse 90% 85% at 0% 0%, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.6) 45%, rgba(0, 0, 0, 0.25) 75%, transparent 100%)',
          }}
        />
      </div>

      {/* =========================================================================
          TOP REGION: Brand, Editorial Typography (Top-Left), & Live Counter (Top-Right)
          Safe Area Aware on all Mobile, Tablet, and Desktop Devices
         ========================================================================= */}
      <header
        className={`fixed top-0 inset-x-0 z-20 px-3.5 sm:px-6 md:px-8 flex items-start justify-between pointer-events-none transition-all duration-500 ease-out ${
          isZenMode ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
        style={{
          paddingTop: 'max(0.875rem, env(safe-area-inset-top, 0.875rem))',
          paddingLeft: 'max(0.875rem, env(safe-area-inset-left, 0.875rem))',
          paddingRight: 'max(0.875rem, env(safe-area-inset-right, 0.875rem))',
        }}
      >
        {/* Top-Left: Brand Identity + Editorial Typography Directly Below */}
        <div className="pointer-events-auto flex flex-col items-start gap-2.5 sm:gap-3.5 max-w-sm sm:max-w-md lg:max-w-lg">
          {/* Brand Pill */}
          <div className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl bg-black/60 border border-white/15 backdrop-blur-xl shadow-2xl hover:border-white/30 transition-all">
            <div className="size-5 sm:size-7 rounded-md sm:rounded-lg bg-white/10 flex items-center justify-center p-0.5 sm:p-1 border border-white/20 flex-shrink-0">
              <NaypictLogo className="size-full text-white" strokeWidth={18} />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-black tracking-tight text-white drop-shadow">
                NayPict
              </span>
              <div className="w-px h-3 bg-white/20" />
              <span className="text-[10px] font-mono tracking-widest text-neutral-400 uppercase">
                Visual Archive
              </span>
            </div>
          </div>

          {/* Editorial Typography (Placed directly underneath "NayPict Visual Archive") */}
          <div className="space-y-1 sm:space-y-1.5">
            <h1 className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.08] [text-shadow:_0_2px_12px_rgba(0,0,0,0.95),_0_4px_28px_rgba(0,0,0,0.9)]">
              Visual Stories,<br />
              <span className="text-neutral-200 font-medium [text-shadow:_0_2px_12px_rgba(0,0,0,0.95),_0_4px_28px_rgba(0,0,0,0.9)]">
                Captured in Stillness.
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs md:text-sm text-neutral-200 font-medium leading-relaxed max-w-[290px] sm:max-w-sm md:max-w-md pt-0.5 line-clamp-2 md:line-clamp-none [text-shadow:_0_1px_8px_rgba(0,0,0,0.95)]">
              Glide freely through the infinite canvas. Tap any frame to inspect high-resolution photographs.
            </p>
          </div>
        </div>

        {/* Top-Right Curated Counter Pill (Shows accurate total media count) */}
        {totalCuratedCount > 0 && (
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 sm:py-1.5 rounded-full bg-black/60 border border-white/15 backdrop-blur-xl text-neutral-300 text-[11px] sm:text-xs font-medium shadow-2xl flex-shrink-0">
            <span className="relative flex size-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            <span>
              {totalCuratedCount.toLocaleString()} Captures
            </span>
          </div>
        )}
      </header>

      {/* =========================================================================
          BOTTOM REGION: Floating Glass Dock (Centered)
          Responsive across Mobile (<640px), Tablet (640-1024px), Desktop (>1024px)
         ========================================================================= */}
      <div
        className={`fixed bottom-0 inset-x-0 z-20 px-3.5 sm:px-6 md:px-8 flex justify-center pointer-events-none transition-all duration-500 ease-out ${
          isZenMode ? 'opacity-0 translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
          paddingLeft: 'max(0.875rem, env(safe-area-inset-left, 0.875rem))',
          paddingRight: 'max(0.875rem, env(safe-area-inset-right, 0.875rem))',
        }}
      >
        {/* Floating Glass Pill Dock (iOS / Dynamic Island Glassmorphism) */}
        <nav
          aria-label="Main gallery navigation"
          className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 md:p-2 rounded-2xl md:rounded-full bg-black/75 backdrop-blur-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.85)] hover:border-white/30 transition-all duration-300 max-w-full"
        >
          {/* Primary Action: Explore Gallery */}
          <Link
            href="/photos"
            prefetch={true}
            onClick={() => setNavigatingTarget('/photos')}
            className={`group relative flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl md:rounded-full bg-white text-black font-bold text-xs sm:text-sm shadow-xl hover:bg-neutral-100 active:scale-[0.98] transition-all cursor-pointer ${
              navigatingTarget && navigatingTarget !== '/photos' ? 'opacity-60 pointer-events-none' : ''
            } ${navigatingTarget === '/photos' ? 'ring-2 ring-white/50 bg-white/90 pointer-events-none' : ''}`}
          >
            <ImageIcon className="size-4 text-black flex-shrink-0" />
            <span className="tracking-tight whitespace-nowrap">
              <span className="inline sm:hidden">Explore</span>
              <span className="hidden sm:inline">Explore Gallery</span>
            </span>
            <div className="flex items-center">
              {navigatingTarget === '/photos' ? (
                <Loader2 className="size-3.5 animate-spin text-black" />
              ) : (
                <ArrowRight className="size-3.5 opacity-75 group-hover:translate-x-0.5 transition-transform" />
              )}
            </div>
          </Link>

          {/* Secondary Action: Albums */}
          <Link
            href="/albums"
            prefetch={true}
            onClick={() => setNavigatingTarget('/albums')}
            className={`group flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl md:rounded-full text-neutral-300 hover:text-white hover:bg-white/10 active:bg-white/15 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              navigatingTarget && navigatingTarget !== '/albums' ? 'opacity-60 pointer-events-none' : ''
            } ${navigatingTarget === '/albums' ? 'bg-white/15 text-white pointer-events-none' : ''}`}
          >
            <FolderHeart className="size-4 text-neutral-300 group-hover:text-white transition-colors flex-shrink-0" />
            <span className="whitespace-nowrap">Albums</span>
            {navigatingTarget === '/albums' && (
              <Loader2 className="size-3.5 animate-spin text-white" />
            )}
          </Link>

          {/* Secondary Action: Map Explorer */}
          <Link
            href="/map"
            prefetch={true}
            onClick={() => setNavigatingTarget('/map')}
            className={`group flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl md:rounded-full text-neutral-300 hover:text-white hover:bg-white/10 active:bg-white/15 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              navigatingTarget && navigatingTarget !== '/map' ? 'opacity-60 pointer-events-none' : ''
            } ${navigatingTarget === '/map' ? 'bg-white/15 text-white pointer-events-none' : ''}`}
          >
            <MapPin className="size-4 text-neutral-300 group-hover:text-white transition-colors flex-shrink-0" />
            <span className="whitespace-nowrap">Map</span>
            {navigatingTarget === '/map' && (
              <Loader2 className="size-3.5 animate-spin text-white" />
            )}
          </Link>

          {/* Divider */}
          <div className="w-px h-5 bg-white/20 mx-0.5" />

          {/* Zen Mode Button (44x44px minimum touch target for mobile/tablet) */}
          <button
            type="button"
            onClick={() => setIsZenMode(true)}
            title="Zen Mode (Hide all controls, press Z or Esc)"
            aria-label="Toggle Zen Mode"
            className="size-11 min-w-[44px] min-h-[44px] rounded-xl md:rounded-full text-neutral-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-all flex items-center justify-center cursor-pointer flex-shrink-0"
          >
            <Eye className="size-4" />
          </button>
        </nav>
      </div>

      {/* =========================================================================
          ZEN MODE EXIT CONTROLLER (Safe Area Aware on All Devices)
         ========================================================================= */}
      {isZenMode && (
        <div
          className="fixed top-0 inset-x-0 z-30 flex justify-center pointer-events-none animate-in fade-in duration-300"
          style={{
            paddingTop: 'max(1.25rem, env(safe-area-inset-top, 1.25rem))',
          }}
        >
          <button
            type="button"
            onClick={() => setIsZenMode(false)}
            aria-label="Exit Zen Mode and restore navigation"
            className="pointer-events-auto flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full bg-black/80 hover:bg-black/95 border border-white/25 text-white text-xs font-semibold backdrop-blur-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <EyeOff className="size-3.5 text-neutral-400" />
            <span>Exit Zen Mode</span>
            <span className="hidden sm:inline-block text-[10px] text-neutral-400 font-mono border border-white/20 px-1.5 py-0.5 rounded">
              Esc
            </span>
          </button>
        </div>
      )}
    </main>
  )
}
